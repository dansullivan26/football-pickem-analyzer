import { useEffect, useState } from 'react'
import {
  formatWeatherChip,
  peekWeatherChip,
  weatherForGame,
} from './nwsWeather'
import type { SlateGame } from './types'

export default function GameWeather({ game }: { game: SlateGame }) {
  const [chip, setChip] = useState(() => peekWeatherChip(game))

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const next = await weatherForGame(game)
      if (!cancelled) setChip(next)
    }
    void run()
    const timer = window.setInterval(() => void run(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [game.cbsEventId, game.kickoff, game.venue?.city, game.venue?.state, game.venue?.indoor])

  return (
    <span className={`game-weather ${chip.status}`}>
      {formatWeatherChip(chip)}
    </span>
  )
}
