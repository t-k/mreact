| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 35.776 | ms |
| virtual measured tail refresh | 17.199 | ms |
| virtual subscribed measured tail refresh | 37.074 | ms |
| virtual 60 frame scroll refresh 100k rows | 13.559 | ms |
| virtual stale measured refresh | 36.029 | ms |
| virtual repeated scrollToKey large list head middle tail | 29.302 | ms |
| query deep-key observer updates | 116.414 | ms |
| query notification fanout 1k observers | 96.438 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 68.344 | ms |
| forms many schema issues on one field | 58.558 | ms |
| forms 100 field sequential key input | 7.026 | ms |
| auth current session with large payload | 32.610 | ms |
