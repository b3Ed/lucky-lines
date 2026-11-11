package app.luckylines

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

// Same cases as tests/engine.test.mjs, against the real rules.json the pipeline writes.
class MatcherTest {
    private val rules: JSONObject by lazy {
        val f = listOf("../../docs/data/rules.json", "../docs/data/rules.json", "docs/data/rules.json").map { File(it) }.first { it.exists() }
        JSONObject(f.readText())
    }

    private fun draw(json: String) = JSONObject(json)

    @Test
    fun lottoRoundsAreSeparateAndBonusOnlyForFive() {
        val d = draw("""{"date":"2026-11-07","sets":[{"m":[4,19,30,45,49,51],"x":[40]},{"m":[5,20,22,31,35,57],"x":[11]}]}""")
        val five = Matcher.check(rules.getJSONObject("lotto"), listOf(4, 19, 30, 45, 49, 40), emptyList(), d)
        assertEquals(1, five.size)
        assertEquals("Match 5 + Bonus", five[0].tierLabel)
        assertEquals(1_000_000.0, five[0].amount, 0.0)
        val both = Matcher.check(rules.getJSONObject("lotto"), listOf(4, 19, 5, 20, 22, 1), emptyList(), d)
        assertEquals(listOf(0, 1), both.map { it.round })
        assertEquals(12.0, both.sumOf { it.amount }, 0.0)
        assertTrue(Matcher.check(rules.getJSONObject("lotto"), listOf(1, 2, 3, 6, 7, 8), emptyList(), d).isEmpty())
    }

    @Test
    fun thunderballOnlyPaysThree() {
        val d = draw("""{"date":"x","sets":[{"m":[3,11,23,26,27],"x":[11]}]}""")
        val w = Matcher.check(rules.getJSONObject("thunderball"), listOf(1, 2, 4, 5, 6), listOf(11), d)
        assertEquals(3.0, w.single().amount, 0.0)
        val w2 = Matcher.check(rules.getJSONObject("thunderball"), listOf(3, 11, 23, 1, 2), listOf(11), d)
        assertEquals("3 + Thunderball", w2.single().tierLabel)
        assertEquals(20.0, w2.single().amount, 0.0)
    }

    @Test
    fun euroMillionsUsesBreakdownThenAverage() {
        val d = draw("""{"date":"x","sets":[{"m":[15,18,31,37,41],"x":[1,5]}],"breakdown":{"tiers":[{"level":10,"winners":9,"prize":7.1}]}}""")
        val r = Matcher.check(rules.getJSONObject("euromillions"), listOf(15, 18, 31, 2, 3), listOf(9, 10), d).single()
        assertEquals("Match 3", r.tierLabel)
        assertEquals(7.1, r.amount, 0.0001)
        assertEquals(false, r.estimated)
        val r2 = Matcher.check(rules.getJSONObject("euromillions"), listOf(15, 18, 2, 3, 4), listOf(1, 5), d).single()
        assertEquals("2 + 2 Stars", r2.tierLabel)
        assertTrue(r2.estimated)
    }

    @Test
    fun moneyFormat() {
        assertEquals("£5.2m", Scheduler.money(5_161_856.0))
        assertEquals("£20", Scheduler.money(20.0))
        assertEquals("£7.10", Scheduler.money(7.1))
    }
}
