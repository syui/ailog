import { useState, useEffect, useCallback } from 'react'

export function usePageContext() {
  const [pageContext, setPageContext] = useState({
    isTopPage: true,
    rkey: null,
    url: null
  })

  useEffect(() => {
    const pathname = window.location.pathname
    const url = window.location.href

    // Extract rkey from URL pattern: /posts/xxx or /posts/xxx.html
    const match = pathname.match(/\/posts\/([^/]+)\/?$/)
    if (match) {
      const rkey = match[1].replace(/\.html$/, '')
      setPageContext({
        isTopPage: false,
        rkey,
        url
      })
    } else {
      setPageContext({
        isTopPage: true,
        rkey: null,
        url
      })
    }
  }, [])

  return pageContext
}