| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 35.319 | ms |
| virtual measured tail refresh | 20.269 | ms |
| virtual subscribed measured tail refresh | 34.104 | ms |
| virtual 60 frame scroll refresh 100k rows | 19.959 | ms |
| virtual stale measured refresh | 19.990 | ms |
| virtual repeated scrollToKey large list head middle tail | 38.170 | ms |
| query deep-key observer updates | 85.406 | ms |
| query notification fanout 1k observers | 79.014 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 49.278 | ms |
| forms many schema issues on one field | 2.303 | ms |
| forms 100 field sequential key input | 6.822 | ms |
| auth current session with large payload | 32.072 | ms |
