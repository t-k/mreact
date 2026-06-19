| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 32.710 | ms |
| virtual measured tail refresh | 19.621 | ms |
| virtual subscribed measured tail refresh | 33.279 | ms |
| virtual 60 frame scroll refresh 100k rows | 19.900 | ms |
| virtual stale measured refresh | 19.439 | ms |
| virtual repeated scrollToKey large list head middle tail | 41.234 | ms |
| query deep-key observer updates | 81.817 | ms |
| query notification fanout 1k observers | 76.733 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 60.167 | ms |
| forms many schema issues on one field | 2.580 | ms |
| forms 100 field sequential key input | 7.623 | ms |
| auth current session with large payload | 32.251 | ms |
