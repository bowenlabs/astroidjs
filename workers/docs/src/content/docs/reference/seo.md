---
title: SEO
description: Sitemaps, robots, and structured data.
sidebar:
  order: 10
---

`astroidSitemapXml`, `astroidRobotsTxt`, `astroidStructuredData`,
`resolvePageSeo`, `escapeJsonLd`, `astroidNoindexPaths`.

`escapeJsonLd` escapes `<`, `>`, `&` as `\uXXXX` so a `</script>` in CMS content
can't break out of a JSON-LD block.
