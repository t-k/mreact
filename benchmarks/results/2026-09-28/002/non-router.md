| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 52.060 | ms |
| virtual measured tail refresh | 8.042 | ms |
| virtual subscribed measured tail refresh | 1060.126 | ms |
| virtual 60 frame scroll refresh 100k rows | 8.581 | ms |
| virtual stale measured refresh | 13.251 | ms |
| virtual repeated scrollToKey large list head middle tail | 26.076 | ms |
| query deep-key observer updates | 140.597 | ms |
| query notification fanout 1k observers | 116.495 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 43.021 | ms |
| forms many schema issues on one field | 2.874 | ms |
| forms 100 field sequential key input | 4.005 | ms |
| auth current session with large payload | 31.352 | ms |
