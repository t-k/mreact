| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 54.656 | ms |
| virtual measured tail refresh | 10.833 | ms |
| virtual subscribed measured tail refresh | 1247.829 | ms |
| virtual 60 frame scroll refresh 100k rows | 10.372 | ms |
| virtual stale measured refresh | 16.766 | ms |
| virtual repeated scrollToKey large list head middle tail | 26.446 | ms |
| query deep-key observer updates | 169.525 | ms |
| query notification fanout 1k observers | 144.460 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 57.464 | ms |
| forms many schema issues on one field | 3.196 | ms |
| forms 100 field sequential key input | 5.396 | ms |
| auth current session with large payload | 33.746 | ms |
