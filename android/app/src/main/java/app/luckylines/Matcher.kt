package app.luckylines

import org.json.JSONArray
import org.json.JSONObject

// Kotlin twin of web/engine/match.js, driven by the same rules.json. Keep the two in step.
data class Win(val round: Int, val tierLabel: String, val amount: Double, val estimated: Boolean, val jackpot: Boolean)

object Matcher {
    private fun ints(a: JSONArray?): List<Int> = if (a == null) emptyList() else (0 until a.length()).map { a.getInt(it) }

    fun check(rules: JSONObject, main: List<Int>, extra: List<Int>, draw: JSONObject): List<Win> {
        val tiers = rules.getJSONArray("tiers")
        val hasBonus = rules.optBoolean("hasBonus")
        val sets = draw.getJSONArray("sets")
        val breakdown = draw.optJSONObject("breakdown")?.optJSONArray("tiers")
        val wins = mutableListOf<Win>()
        for (round in 0 until sets.length()) {
            val set = sets.getJSONObject(round)
            val m = ints(set.optJSONArray("m"))
            val x = ints(set.optJSONArray("x"))
            val mainHits = main.count { it in m }
            val bonusHit = hasBonus && x.isNotEmpty() && x[0] in main && x[0] !in m
            val extraHits = if (hasBonus) 0 else extra.count { it in x }
            for (i in 0 until tiers.length()) {
                val t = tiers.getJSONObject(i)
                if (t.getInt("main") != mainHits) continue
                val ok = if (hasBonus) t.isNull("bonus") || t.getBoolean("bonus") == bonusHit
                else !t.isNull("extra") && t.getInt("extra") == extraHits
                if (!ok) continue
                var amount = if (t.isNull("prize")) 0.0 else t.getDouble("prize")
                var estimated = t.optBoolean("estimated")
                val fixed = !estimated && !t.optBoolean("jackpot")
                if (!fixed && breakdown != null) {
                    val level = i + 1 + round * tiers.length()
                    for (b in 0 until breakdown.length()) {
                        val row = breakdown.getJSONObject(b)
                        if (row.optInt("level") == level && !row.isNull("prize") && row.optDouble("prize", 0.0) > 0) {
                            amount = row.getDouble("prize")
                            estimated = false
                        }
                    }
                }
                wins.add(Win(round, t.getString("label"), amount, estimated, t.optBoolean("jackpot")))
                break
            }
        }
        return wins
    }
}
