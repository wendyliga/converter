const FALLBACK_REPO_URL = 'https://github.com/wendyliga/converter'

const repoUrl = import.meta.env.VITE_GITHUB_REPO_URL || FALLBACK_REPO_URL
const fullCommit = import.meta.env.VITE_BUILD_COMMIT || ''
const shortCommit = import.meta.env.VITE_BUILD_COMMIT_SHORT || ''

export const githubRepoUrl = repoUrl
export const buildVersion = shortCommit || 'development'
export const buildHref = fullCommit ? `${repoUrl}/commit/${fullCommit}` : repoUrl