package app.luckylines

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.util.Locale
import java.util.concurrent.TimeUnit

object Scheduler {
    private const val REMIND_TAG = "remind"

    fun schedulePeriodic(c: Context) {
        val req = PeriodicWorkRequestBuilder<ResultsWorker>(1, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(c).enqueueUniquePeriodicWork("results", ExistingPeriodicWorkPolicy.KEEP, req)
    }

    // Draw-day reminders for the next week, rebuilt every time the app syncs.
    fun scheduleReminders(c: Context) {
        val wm = WorkManager.getInstance(c)
        wm.cancelAllWorkByTag(REMIND_TAG)
        val sync = Store.sync(c) ?: return
        val settings = sync.optJSONObject("settings") ?: return
        if (!settings.optBoolean("remind", true)) return
        val rules = Store.rules(c) ?: return
        val time = try { LocalTime.parse(settings.optString("remindTime", "18:00")) } catch (e: Exception) { LocalTime.of(18, 0) }
        val games = mutableSetOf<String>()
        settings.optJSONArray("usual")?.let { a -> for (i in 0 until a.length()) games.add(a.getString(i)) }
        val tickets = sync.optJSONArray("tickets")
        val today = LocalDate.now()
        if (tickets != null) for (i in 0 until tickets.length()) {
            val t = tickets.getJSONObject(i)
            if (t.optString("status") == "planned" && LocalDate.parse(t.getString("drawDate")) >= today) games.add(t.getString("game"))
        }
        val now = LocalDateTime.now()
        for (g in games) {
            val r = rules.optJSONObject(g) ?: continue
            val days = r.getJSONArray("days")
            val jsDays = (0 until days.length()).map { days.getInt(it) }
            for (d in 0..7) {
                val date = today.plusDays(d.toLong())
                val jsDay = date.dayOfWeek.value % 7 // Sunday = 0, like JavaScript
                if (jsDay !in jsDays) continue
                val at = LocalDateTime.of(date, time)
                if (at.isBefore(now)) continue
                val req = OneTimeWorkRequestBuilder<ReminderWorker>()
                    .setInitialDelay(Duration.between(now, at).toMillis(), TimeUnit.MILLISECONDS)
                    .setInputData(workDataOf("game" to g, "date" to date.toString()))
                    .addTag(REMIND_TAG)
                    .build()
                wm.enqueueUniqueWork("remind-$g-$date", ExistingWorkPolicy.REPLACE, req)
            }
        }
    }

    fun money(v: Double): String = when {
        v >= 1_000_000 -> "£" + String.format(Locale.UK, "%.1f", v / 1_000_000).removeSuffix(".0") + "m"
        v % 1.0 == 0.0 -> "£" + String.format(Locale.UK, "%,d", v.toLong())
        else -> "£" + String.format(Locale.UK, "%,.2f", v)
    }
}

class ReminderWorker(c: Context, p: WorkerParameters) : CoroutineWorker(c, p) {
    override suspend fun doWork(): Result {
        val game = inputData.getString("game") ?: return Result.success()
        val date = inputData.getString("date") ?: return Result.success()
        val sync = Store.sync(applicationContext) ?: return Result.success()
        val rules = Store.rules(applicationContext)?.optJSONObject(game) ?: return Result.success()
        val name = rules.optString("name", game)
        var planned = 0
        sync.optJSONArray("tickets")?.let { a ->
            for (i in 0 until a.length()) {
                val t = a.getJSONObject(i)
                if (t.optString("game") == game && t.optString("drawDate") == date && t.optString("status") != "skipped") planned++
            }
        }
        val next = sync.optJSONObject("next")?.optJSONObject(game)
        val jackpot = when {
            next != null && next.optString("date") == date && !next.isNull("jackpot") -> Scheduler.money(next.getDouble("jackpot")) + " jackpot"
            next != null && next.optString("date") == date && !next.isNull("jackpotText") -> next.getString("jackpotText")
            else -> "Draw tonight"
        }
        val lines = if (planned > 0) "You've got $planned line${if (planned > 1) "s" else ""} lined up." else "Our three picks are ready."
        Notify.show(applicationContext, Notify.DRAWS, ("remind$game$date").hashCode(), "$name tonight: $jackpot", "$lines Sales close ${rules.optString("cutoff", "19:30").replace("19:30", "7.30pm")}.")
        return Result.success()
    }
}

class ResultsWorker(c: Context, p: WorkerParameters) : CoroutineWorker(c, p) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val ctx = applicationContext
        val sync = Store.sync(ctx) ?: return@withContext Result.success()
        if (sync.optJSONObject("settings")?.optBoolean("winAlerts", true) == false) return@withContext Result.success()
        val tickets = sync.optJSONArray("tickets") ?: return@withContext Result.success()
        if (tickets.length() == 0) return@withContext Result.success()
        val rules = Store.rules(ctx) ?: return@withContext Result.success()
        val base = sync.optString("dataUrl")
        if (!base.startsWith("https://")) return@withContext Result.success()
        val summary = try { fetch("${base}summary.json?t=${System.currentTimeMillis() / 600000}") } catch (e: Exception) { return@withContext Result.retry() }
        val games = summary.optJSONObject("games") ?: return@withContext Result.success()
        val notified = Store.notified(ctx)
        val done = mutableListOf<String>()
        for (i in 0 until tickets.length()) {
            val t = tickets.getJSONObject(i)
            val id = t.getString("id")
            if (id in notified || t.optString("status") == "skipped") continue
            val game = t.getString("game")
            val latest = games.optJSONObject(game)?.optJSONObject("latest") ?: continue
            if (latest.optString("date") != t.getString("drawDate")) continue
            val gRules = rules.optJSONObject(game) ?: continue
            val main = (0 until t.getJSONArray("main").length()).map { t.getJSONArray("main").getInt(it) }
            val extra = t.optJSONArray("extra")?.let { a -> (0 until a.length()).map { a.getInt(it) } } ?: emptyList()
            val wins = Matcher.check(gRules, main, extra, latest)
            done.add(id)
            if (wins.isEmpty()) continue
            val total = wins.sumOf { it.amount }
            val name = gRules.optString("name", game)
            val what = wins.joinToString(", ") { it.tierLabel + if (gRules.optInt("rounds", 1) > 1) " (Round ${it.round + 1})" else "" }
            val title = when {
                wins.any { it.jackpot } -> "JACKPOT on $name! Check your ticket now"
                total > 0 -> "You won ${Scheduler.money(total)}${if (wins.any { it.estimated }) " (est.)" else ""} on $name"
                else -> "Winner on $name"
            }
            Notify.show(ctx, Notify.WINS, id.hashCode(), title, "$what. ${t.optString("label", "Your line")}. Open Lucky Lines to log it.")
        }
        if (done.isNotEmpty()) Store.markNotified(ctx, done)
        Result.success()
    }

    private fun fetch(url: String): JSONObject {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 15000
        conn.readTimeout = 20000
        conn.setRequestProperty("Cache-Control", "no-cache")
        try {
            if (conn.responseCode != 200) throw IllegalStateException("HTTP ${conn.responseCode}")
            return JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
        } finally {
            conn.disconnect()
        }
    }
}
