| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 48.668 | ms |
| virtual measured tail refresh | 10.490 | ms |
| virtual subscribed measured tail refresh | 50.187 | ms |
| virtual 60 frame scroll refresh 100k rows | 14.009 | ms |
| virtual stale measured refresh | 35.200 | ms |
| virtual repeated scrollToKey large list head middle tail | 32.772 | ms |
| query deep-key observer updates | 130.035 | ms |
| query notification fanout 1k observers | 95.611 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 106.534 | ms |
| forms many schema issues on one field | 2.783 | ms |
| forms 100 field sequential key input | 10.057 | ms |
| auth current session with large payload | 34.998 | ms |
