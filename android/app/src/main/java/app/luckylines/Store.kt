package app.luckylines

import android.content.Context
import org.json.JSONObject

// What the web app last told us (settings, tickets, next jackpots), plus which tickets we've already alerted on.
object Store {
    private const val PREFS = "lucky"

    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun saveSync(c: Context, json: String) {
        prefs(c).edit().putString("sync", json).apply()
    }

    fun sync(c: Context): JSONObject? = prefs(c).getString("sync", null)?.let {
        try { JSONObject(it) } catch (e: Exception) { null }
    }

    fun notified(c: Context): MutableSet<String> = prefs(c).getStringSet("notified", emptySet())!!.toMutableSet()

    fun markNotified(c: Context, ids: Collection<String>) {
        val set = notified(c)
        set.addAll(ids)
        // Keep the list from growing forever.
        val trimmed = if (set.size > 400) set.toList().takeLast(300).toSet() else set
        prefs(c).edit().putStringSet("notified", trimmed).apply()
    }

    fun rules(c: Context): JSONObject? = try {
        c.assets.open("web/data/rules.json").bufferedReader().use { JSONObject(it.readText()) }
    } catch (e: Exception) { null }
}
