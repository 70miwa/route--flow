import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      aria-label="Toggle theme"
      className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 text-slate-600 transition hover:bg-black/10 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/20"
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
