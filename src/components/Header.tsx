import { ThemeToggle } from './ThemeToggle'
import { githubRepoUrl } from '../core/buildInfo'

export function Header() {
  return (
    <header className="titlebar">
      <div className="region-inner titlebar-inner">
        <div className="titlebar-brand">
          <span className="brand-mark" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 8h13M13 3.5 17.5 8 13 12.5" />
              <path d="M20 16H7M11 11.5 6.5 16l4.5 4.5" />
            </svg>
          </span>
          <span className="brand-name">Converter</span>
          <span className="brand-tagline">image conversion, in-browser</span>
        </div>
        <nav className="titlebar-actions" aria-label="Site">
          <a
            className="titlebar-link"
            href={githubRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Source
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}
