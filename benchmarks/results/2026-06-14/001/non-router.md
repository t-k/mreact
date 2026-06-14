| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 32.323 | ms |
| virtual measured tail refresh | 19.161 | ms |
| virtual subscribed measured tail refresh | 33.666 | ms |
| virtual 60 frame scroll refresh 100k rows | 19.612 | ms |
| virtual stale measured refresh | 20.848 | ms |
| virtual repeated scrollToKey large list head middle tail | 37.068 | ms |
| query deep-key observer updates | 87.986 | ms |
| query notification fanout 1k observers | 76.174 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 52.057 | ms |
| forms many schema issues on one field | 2.504 | ms |
| forms 100 field sequential key input | 7.192 | ms |
| auth current session with large payload | 32.875 | ms |
