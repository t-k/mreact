| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 30.437 | ms |
| virtual measured tail refresh | 22.902 | ms |
| virtual subscribed measured tail refresh | 36.659 | ms |
| virtual 60 frame scroll refresh 100k rows | 21.259 | ms |
| virtual stale measured refresh | 22.520 | ms |
| virtual repeated scrollToKey large list head middle tail | 37.516 | ms |
| query deep-key observer updates | 93.989 | ms |
| query notification fanout 1k observers | 80.606 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 50.198 | ms |
| forms many schema issues on one field | 2.547 | ms |
| forms 100 field sequential key input | 7.527 | ms |
| auth current session with large payload | 98.783 | ms |
