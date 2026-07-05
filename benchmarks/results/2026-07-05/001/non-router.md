| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 49.049 | ms |
| virtual measured tail refresh | 8.742 | ms |
| virtual subscribed measured tail refresh | 40.450 | ms |
| virtual 60 frame scroll refresh 100k rows | 13.575 | ms |
| virtual stale measured refresh | 33.548 | ms |
| virtual repeated scrollToKey large list head middle tail | 30.424 | ms |
| query deep-key observer updates | 136.164 | ms |
| query notification fanout 1k observers | 116.984 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 73.331 | ms |
| forms many schema issues on one field | 63.309 | ms |
| forms 100 field sequential key input | 8.587 | ms |
| auth current session with large payload | 31.421 | ms |
