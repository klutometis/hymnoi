# Deploying hymnoi.org

Decided 2026-10-21: **hymnoi.org is canonical**. hymnoi.com and olympioi.org
redirect to it (301, path kept). Peter also mentioned olympioi.com; it is not in
`~/prg/domains`, so check it is his before adding it to the redirects.

Nothing here has been done yet. The GitHub steps need Peter's go-ahead to push
(the repo is public); DNS and redirects belong to the session that owns the
domain migration (`mercurial-stele`) or to Peter.

Status 2026-10-21 16:20: all three domains are at Porkbun with DNS on Cloudflare
(ganz/paige.ns.cloudflare.com), no DS records (the stale Google Domains DNSSEC is
gone), and **empty zones**.

Status 2026-10-21 17:00: **step 1 done.** Peter approved the push; `master` is
`66a4caf`, Pages is enabled (workflow), the first deploy succeeded, and the repo's
custom domain is hymnoi.org. hymnoi.org was *already* a verified domain on the
klutometis account (github.com/settings/pages); its challenge record (below) is
being restored so GitHub's periodic re-check keeps passing. Records sent to
`mercurial-stele` to add. Remaining: DNS (2, 3), then HTTPS enforcement and the
checks in 4.

Status 2026-10-21 17:12: **live.** `mercurial-stele` added the records at 16:59
(and keeps them in `~/prg/domains/tools/cloudflare_sync.py`). GitHub's health check
had cached the empty zone and requested no certificate; removing and re-adding the
custom domain made it request one (Let's Encrypt, hymnoi.org + www, approved in
about ten seconds, expires 2027-01-19, renewed by GitHub). That detaches the
deployment, so hymnoi.org returned 404 until the workflow was re-run (`gh workflow
run pages.yml`): **after touching the custom domain, redeploy.** HTTPS enforced.
olympioi.org redirects with **302**, not 301, on purpose: it may get a site of its
own, and browsers cache a 301 indefinitely. Make it 301 if that is ever settled.

Checked: https://hymnoi.org/ and every page, the JSON and the PDFs return 200
(JSON and PDF byte-identical to the local build); www.hymnoi.org, hymnoi.com and
www.hymnoi.com 301 to https://hymnoi.org with path and query kept; olympioi.org and
www 302 likewise; certificate CN=hymnoi.org, issuer Let's Encrypt.

From now on, a push to `main` deploys (`git push origin hymnoi:main` from the worktree).

2026-10-22: the default branch was renamed `master` → `main` (GitHub's rename, which
redirects the old name); the workflow trigger and the `github-pages` environment's
deployment-branch policy, which the rename does not update, were moved to `main` by hand.

Verification record (hymnoi.org zone):

| Type | Name | Content |
|---|---|---|
| TXT | _github-pages-challenge-klutometis | c341b58dcbc7b91e9aa4d335adfd70 |

## 1. GitHub Pages (this repo)

The site is static: `site/` as committed, with `site/data/hymnoi.json` built by
`tools/build.py`. `.github/workflows/pages.yml` rebuilds the JSON and publishes
`site/` on every push to `main`.

```
gh api -X POST repos/klutometis/hymnoi/pages -f build_type=workflow   # done 2026-10-21 (before the push, so it deploys)
gh api -X PUT  repos/klutometis/hymnoi/pages -f cname=hymnoi.org      # done
git push origin hymnoi:master                                          # done: b0dd08c..66a4caf
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
