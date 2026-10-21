# Deploying hymnoi.org

Decided 2026-10-21: **hymnoi.org is canonical**. hymnoi.com and olympioi.org
redirect to it (301, path kept). Peter also mentioned olympioi.com; it is not in
`~/prg/domains`, so check it is his before adding it to the redirects.

Nothing here has been done yet. The GitHub steps need Peter's go-ahead to push
(the repo is public); DNS and redirects belong to the session that owns the
domain migration (`mercurial-stele`) or to Peter.

## 1. GitHub Pages (this repo)

The site is static: `site/` as committed, with `site/data/hymnoi.json` built by
`tools/build.py`. `.github/workflows/pages.yml` rebuilds the JSON and publishes
`site/` on every push to `master`.

```
git push origin hymnoi:master                       # after review; fast-forward from b0dd08c
gh api -X POST repos/klutometis/hymnoi/pages -f build_type=workflow
gh api -X PUT  repos/klutometis/hymnoi/pages -f cname=hymnoi.org
# after DNS resolves and the certificate is issued (minutes to an hour):
gh api -X PUT  repos/klutometis/hymnoi/pages -F https_enforced=true
```

## 2. DNS for hymnoi.org (Cloudflare zone; DNS only, grey cloud)

| Type | Name | Content |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| AAAA | @ | 2606:50c0:8000::153 |
| AAAA | @ | 2606:50c0:8001::153 |
| AAAA | @ | 2606:50c0:8002::153 |
| AAAA | @ | 2606:50c0:8003::153 |
| CNAME | www | klutometis.github.io |

Grey cloud matters: GitHub issues the certificate itself and cannot while
Cloudflare proxies the name. Remove any leftover DNSSEC DS record from the old
registrar before the switch.

Optional, recommended: verify the domain for the account
(github.com/settings/pages → Add a domain → a `TXT _github-pages-challenge-klutometis`
record), so no other repo can claim hymnoi.org.

## 3. Redirects (Cloudflare, per zone)

For **hymnoi.com** and **olympioi.org** (and **olympioi.com** if his):

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | @ | 192.0.2.1 | proxied (orange) |
| A | www | 192.0.2.1 | proxied (orange) |

(192.0.2.1 is a reserved documentation address: the proxy answers before it is
ever used.) Then a Single Redirect rule in each zone: *all incoming requests* →
dynamic, `concat("https://hymnoi.org", http.request.uri.path)`, status **301**,
preserve query string.

## 4. Check the far end

```
curl -sI https://hymnoi.org/ | head -3              # 200, server: GitHub.com
curl -sI https://www.hymnoi.org/ | grep -i location # → https://hymnoi.org/
curl -sI https://hymnoi.com/some/path | grep -i location   # → https://hymnoi.org/some/path
curl -sI https://olympioi.org/ | grep -i location   # → https://hymnoi.org/
```
