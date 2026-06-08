export interface BenchmarkRunMeta {
  readonly arch: string;
  readonly cpuCount: number;
  readonly cpuModel: string;
  readonly date: string;
  readonly gitCommit: string;
  readonly nodeVersion: string;
  readonly path: string;
  readonly pnpmVersion: string;
}

export interface BenchmarkRankingRow {
  readonly caseName: string;
  readonly diff: string;
  readonly framework: string;
  readonly isMreact: boolean;
  readonly rank: number;
  readonly unit: string;
  readonly value: string;
}

export interface BenchmarkRankingCard {
  readonly description: string;
  readonly id: string;
  readonly rows: readonly BenchmarkRankingRow[];
  readonly title: string;
}

export interface BenchmarkRankingSuite {
  readonly cardCount: number;
  readonly cards: readonly BenchmarkRankingCard[];
  readonly id: string;
  readonly source: string;
  readonly title: string;
}

export const latestBenchmarkRun: BenchmarkRunMeta = {
  arch: "linux x64",
  cpuCount: 4,
  cpuModel: "AMD EPYC 7763 64-Core Processor",
  date: "2026-06-07",
  gitCommit: "4dab6e4378238459374b7c5650c176c49c3dd88e",
  nodeVersion: "v24.16.0",
  path: "benchmarks/results/2026-06-07/002",
  pnpmVersion: "10.19.0",
};

export const benchmarkRankingSuites: readonly BenchmarkRankingSuite[] = [
  {
    id: "primitive",
    title: "Primitive benchmarks",
    source: "primitive.md",
    cardCount: 15,
    cards: [
      {
        id: "primitive-create-1k-rows",
        title: "create 1k rows",
        description: "Creates 1,000 DOM rows from an empty host and validates the final DOM.",
        rows: [
          {
            rank: 1,
            framework: "mreact",
            caseName: "create 1k rows",
            value: "8.2439",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "react",
            caseName: "create 1k rows",
            value: "8.5675",
            diff: "+3.93%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 3,
            framework: "solid",
            caseName: "create 1k rows",
            value: "9.0742",
            diff: "+10.07%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 4,
            framework: "solid-v2",
            caseName: "create 1k rows",
            value: "10.3706",
            diff: "+25.8%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 5,
            framework: "marko",
            caseName: "create 1k rows",
            value: "14.4893",
            diff: "+75.76%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "qwik",
            caseName: "create 1k rows",
            value: "15.7652",
            diff: "+91.23%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "mreact react-compat",
            caseName: "create 1k rows",
            value: "15.9767",
            diff: "+93.8%",
            unit: "ms",
            isMreact: true
          }
        ]
      },
      {
        id: "primitive-replace-all-1k-rows",
        title: "replace all 1k rows",
        description: "Replaces an existing 1,000-row keyed list with a fresh 1,000-row dataset.",
        rows: [
          {
            rank: 1,
            framework: "solid",
            caseName: "replace all 1k rows",
            value: "10.139",
            diff: "best",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 2,
            framework: "solid-v2",
            caseName: "replace all 1k rows",
            value: "10.5319",
            diff: "+3.88%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 3,
            framework: "mreact react-compat",
            caseName: "replace all 1k rows",
            value: "10.6026",
            diff: "+4.57%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 4,
            framework: "mreact",
            caseName: "replace all 1k rows",
            value: "12.0305",
            diff: "+18.66%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 5,
            framework: "react",
            caseName: "replace all 1k rows",
            value: "13.5994",
            diff: "+34.13%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "marko",
            caseName: "replace all 1k rows",
            value: "15.5658",
            diff: "+53.52%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "qwik",
            caseName: "replace all 1k rows",
            value: "18.9019",
            diff: "+86.43%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "primitive-update-every-10th-in-10k-rows",
        title: "update every 10th in 10k rows",
        description: "Updates the text of every tenth row in a 10,000-row keyed list while preserving the existing row nodes.",
        rows: [
          {
            rank: 1,
            framework: "mreact",
            caseName: "update every 10th in 10k rows",
            value: "2.9122",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact react-compat",
            caseName: "update every 10th in 10k rows",
            value: "5.3868",
            diff: "+84.97%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "react",
            caseName: "update every 10th in 10k rows",
            value: "5.4221",
            diff: "+86.19%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 4,
            framework: "marko",
            caseName: "update every 10th in 10k rows",
            value: "35.0622",
            diff: "+1103.98%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 5,
            framework: "qwik",
            caseName: "update every 10th in 10k rows",
            value: "93.1548",
            diff: "+3098.78%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "solid-v2",
            caseName: "update every 10th in 10k rows",
            value: "129.309",
            diff: "+4340.25%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "solid",
            caseName: "update every 10th in 10k rows",
            value: "133.1777",
            diff: "+4473.1%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "primitive-select-row-in-10k-rows",
        title: "select row in 10k rows",
        description: "Selects one row in a 10,000-row list by toggling selection attributes without changing row text.",
        rows: [
          {
            rank: 1,
            framework: "mreact",
            caseName: "select row in 10k rows",
            value: "0.0811",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact react-compat",
            caseName: "select row in 10k rows",
            value: "3.234",
            diff: "+3887.67%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "react",
            caseName: "select row in 10k rows",
            value: "3.4194",
            diff: "+4116.28%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 4,
            framework: "solid-v2",
            caseName: "select row in 10k rows",
            value: "35.6576",
            diff: "+43867.45%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 5,
            framework: "marko",
            caseName: "select row in 10k rows",
            value: "35.8451",
            diff: "+44098.64%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "solid",
            caseName: "select row in 10k rows",
            value: "46.1209",
            diff: "+56769.17%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "qwik",
            caseName: "select row in 10k rows",
            value: "102.9318",
            diff: "+126819.61%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "primitive-append-1k-rows-to-10k-rows",
        title: "append 1k rows to 10k rows",
        description: "Appends 1,000 keyed rows to an existing 10,000-row list and validates the 11,000-row DOM.",
        rows: [
          {
            rank: 1,
            framework: "mreact react-compat",
            caseName: "append 1k rows to 10k rows",
            value: "12.3151",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact",
            caseName: "append 1k rows to 10k rows",
            value: "19.6337",
            diff: "+59.43%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "react",
            caseName: "append 1k rows to 10k rows",
            value: "29.7489",
            diff: "+141.56%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 4,
            framework: "marko",
            caseName: "append 1k rows to 10k rows",
            value: "55.1998",
            diff: "+348.23%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 5,
            framework: "qwik",
            caseName: "append 1k rows to 10k rows",
            value: "113.7946",
            diff: "+824.02%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "solid",
            caseName: "append 1k rows to 10k rows",
            value: "135.309",
            diff: "+998.72%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "solid-v2",
            caseName: "append 1k rows to 10k rows",
            value: "147.8416",
            diff: "+1100.49%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "primitive-remove-row-from-1k-rows",
        title: "remove row from 1k rows",
        description: "Removes one keyed row from the middle of an existing 1,000-row list.",
        rows: [
          {
            rank: 1,
            framework: "mreact",
            caseName: "remove row from 1k rows",
            value: "0.3107",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "react",
            caseName: "remove row from 1k rows",
            value: "0.4357",
            diff: "+40.23%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 3,
            framework: "mreact react-compat",
            caseName: "remove row from 1k rows",
            value: "0.7255",
            diff: "+133.5%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 4,
            framework: "marko",
            caseName: "remove row from 1k rows",
            value: "1.2488",
            diff: "+301.93%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 5,
            framework: "solid-v2",
            caseName: "remove row from 1k rows",
            value: "3.1325",
            diff: "+908.21%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "solid",
            caseName: "remove row from 1k rows",
            value: "3.2677",
            diff: "+951.72%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "qwik",
            caseName: "remove row from 1k rows",
            value: "6.2271",
            diff: "+1904.22%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "primitive-clear-10k-rows",
        title: "clear 10k rows",
        description: "Clears an existing 10,000-row list and validates that no row elements remain.",
        rows: [
          {
            rank: 1,
            framework: "solid-v2",
            caseName: "clear 10k rows",
            value: "29.0268",
            diff: "best",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 2,
            framework: "solid",
            caseName: "clear 10k rows",
            value: "30.0955",
            diff: "+3.68%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 3,
            framework: "mreact",
            caseName: "clear 10k rows",
            value: "34.5834",
            diff: "+19.14%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 4,
            framework: "mreact react-compat",
            caseName: "clear 10k rows",
            value: "43.104",
            diff: "+48.5%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 5,
            framework: "qwik",
            caseName: "clear 10k rows",
            value: "53.6854",
            diff: "+84.95%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "react",
            caseName: "clear 10k rows",
            value: "58.5162",
            diff: "+101.59%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "marko",
            caseName: "clear 10k rows",
            value: "63.4307",
            diff: "+118.52%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "primitive-keyed-reverse-1k-rows",
        title: "keyed reverse 1k rows",
        description: "Reverses 1,000 keyed rows and verifies that DOM node identity is preserved.",
        rows: [
          {
            rank: 1,
            framework: "mreact",
            caseName: "keyed reverse 1k rows",
            value: "3.7723",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "solid",
            caseName: "keyed reverse 1k rows",
            value: "3.8061",
            diff: "+0.9%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 3,
            framework: "solid-v2",
            caseName: "keyed reverse 1k rows",
            value: "3.9276",
            diff: "+4.12%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 4,
            framework: "react",
            caseName: "keyed reverse 1k rows",
            value: "5.6624",
            diff: "+50.1%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 5,
            framework: "mreact react-compat",
            caseName: "keyed reverse 1k rows",
            value: "6.2799",
            diff: "+66.47%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 6,
            framework: "marko",
            caseName: "keyed reverse 1k rows",
            value: "6.6824",
            diff: "+77.14%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "qwik",
            caseName: "keyed reverse 1k rows",
            value: "9.1423",
            diff: "+142.35%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "primitive-create-1k-event-targets",
        title: "create 1k event targets",
        description: "Creates 1,000 button event targets and measures initial interactive wiring cost without dispatching events.",
        rows: [
          {
            rank: 1,
            framework: "solid-v2",
            caseName: "create 1k event targets",
            value: "12.6506",
            diff: "best",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 2,
            framework: "solid",
            caseName: "create 1k event targets",
            value: "13.4786",
            diff: "+6.55%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 3,
            framework: "mreact",
            caseName: "create 1k event targets",
            value: "14.259",
            diff: "+12.71%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 4,
            framework: "react",
            caseName: "create 1k event targets",
            value: "14.4552",
            diff: "+14.26%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 5,
            framework: "mreact react-compat",
            caseName: "create 1k event targets",
            value: "17.8816",
            diff: "+41.35%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 6,
            framework: "qwik",
            caseName: "create 1k event targets",
            value: "18.3614",
            diff: "+45.14%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "marko",
            caseName: "create 1k event targets",
            value: "22.2825",
            diff: "+76.14%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "primitive-source-write-with-subscriber-1k",
        title: "source write with subscriber 1k",
        description: "Updates 1,000 fine-grained source values when each source has one live non-DOM subscriber, separating direct source write overhead from aggregate computed fan-in and framework-level array update work.",
        rows: [
          {
            rank: 1,
            framework: "mreact",
            caseName: "source write with subscriber 1k",
            value: "0.1798",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "solid-v2",
            caseName: "source write with subscriber 1k",
            value: "0.3127",
            diff: "+73.92%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 3,
            framework: "solid",
            caseName: "source write with subscriber 1k",
            value: "0.3131",
            diff: "+74.14%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "primitive-text-binding-update-1k",
        title: "text binding update 1k",
        description: "Updates one reactive text value that is bound to 1,000 text nodes.",
        rows: [
          {
            rank: 1,
            framework: "solid",
            caseName: "text binding update 1k",
            value: "0.301",
            diff: "best",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 2,
            framework: "mreact",
            caseName: "text binding update 1k",
            value: "0.3028",
            diff: "+0.6%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "solid-v2",
            caseName: "text binding update 1k",
            value: "0.3384",
            diff: "+12.43%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 4,
            framework: "react",
            caseName: "text binding update 1k",
            value: "0.844",
            diff: "+180.4%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 5,
            framework: "marko",
            caseName: "text binding update 1k",
            value: "1.5742",
            diff: "+422.99%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "mreact react-compat",
            caseName: "text binding update 1k",
            value: "1.9008",
            diff: "+531.5%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 7,
            framework: "qwik",
            caseName: "text binding update 1k",
            value: "2.5134",
            diff: "+735.02%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "primitive-computed-fan-out-1k",
        title: "computed fan-out 1k",
        description: "Updates one source value that fans out through a derived value into 1,000 displayed text nodes.",
        rows: [
          {
            rank: 1,
            framework: "solid",
            caseName: "computed fan-out 1k",
            value: "0.3025",
            diff: "best",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 2,
            framework: "solid-v2",
            caseName: "computed fan-out 1k",
            value: "0.3066",
            diff: "+1.36%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 3,
            framework: "mreact",
            caseName: "computed fan-out 1k",
            value: "0.3312",
            diff: "+9.49%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 4,
            framework: "react",
            caseName: "computed fan-out 1k",
            value: "0.8135",
            diff: "+168.93%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 5,
            framework: "marko",
            caseName: "computed fan-out 1k",
            value: "1.6167",
            diff: "+434.45%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "mreact react-compat",
            caseName: "computed fan-out 1k",
            value: "1.8235",
            diff: "+502.81%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 7,
            framework: "qwik",
            caseName: "computed fan-out 1k",
            value: "2.5824",
            diff: "+753.69%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "primitive-computed-fan-in-1k",
        title: "computed fan-in 1k",
        description: "Updates the inputs feeding one aggregate and validates one derived aggregate text output. Caveat: this is not a direct cross-framework source-write comparison because mreact, Solid, and Solid v2 update 1,000 fine-grained sources, while React, Marko, and Qwik update one array/props payload.",
        rows: [
          {
            rank: 1,
            framework: "marko",
            caseName: "computed fan-in 1k",
            value: "0.046",
            diff: "best",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 2,
            framework: "qwik",
            caseName: "computed fan-in 1k",
            value: "0.0792",
            diff: "+72.17%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 3,
            framework: "react",
            caseName: "computed fan-in 1k",
            value: "0.0958",
            diff: "+108.26%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 4,
            framework: "mreact",
            caseName: "computed fan-in 1k",
            value: "0.1002",
            diff: "+117.83%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 5,
            framework: "solid-v2",
            caseName: "computed fan-in 1k",
            value: "0.1141",
            diff: "+148.04%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "mreact react-compat",
            caseName: "computed fan-in 1k",
            value: "0.1285",
            diff: "+179.35%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 7,
            framework: "solid",
            caseName: "computed fan-in 1k",
            value: "31.7517",
            diff: "+68925.43%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "primitive-source-write-1k",
        title: "source write 1k",
        description: "Updates 1,000 fine-grained source values without subscribers, derived values, DOM writes, or framework-level re-render work, then validates the final source values. Frameworks without an equivalent source primitive report this case as unsupported.",
        rows: [
          {
            rank: 1,
            framework: "solid",
            caseName: "source write 1k",
            value: "0.0108",
            diff: "best",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 2,
            framework: "mreact",
            caseName: "source write 1k",
            value: "0.0405",
            diff: "+275%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "solid-v2",
            caseName: "source write 1k",
            value: "0.0461",
            diff: "+326.85%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "primitive-repeated-create-update-clear-memory",
        title: "repeated create update clear memory",
        description: "Reports heap growth after repeatedly creating, updating, and clearing 1,000-row lists.",
        rows: [
          {
            rank: 1,
            framework: "qwik",
            caseName: "repeated create update clear memory",
            value: "73072",
            diff: "best",
            unit: "bytes",
            isMreact: false
          },
          {
            rank: 2,
            framework: "marko",
            caseName: "repeated create update clear memory",
            value: "80096",
            diff: "+9.61%",
            unit: "bytes",
            isMreact: false
          },
          {
            rank: 3,
            framework: "mreact",
            caseName: "repeated create update clear memory",
            value: "89728",
            diff: "+22.79%",
            unit: "bytes",
            isMreact: true
          },
          {
            rank: 4,
            framework: "solid-v2",
            caseName: "repeated create update clear memory",
            value: "91552",
            diff: "+25.29%",
            unit: "bytes",
            isMreact: false
          },
          {
            rank: 5,
            framework: "solid",
            caseName: "repeated create update clear memory",
            value: "112824",
            diff: "+54.4%",
            unit: "bytes",
            isMreact: false
          },
          {
            rank: 6,
            framework: "mreact react-compat",
            caseName: "repeated create update clear memory",
            value: "341192",
            diff: "+366.93%",
            unit: "bytes",
            isMreact: true
          },
          {
            rank: 7,
            framework: "react",
            caseName: "repeated create update clear memory",
            value: "361400",
            diff: "+394.58%",
            unit: "bytes",
            isMreact: false
          }
        ]
      }
    ]
  },
  {
    id: "router",
    title: "Router benchmarks",
    source: "router.md",
    cardCount: 37,
    cards: [
      {
        id: "router-app-render-1000-nodes",
        title: "app render 1000 nodes",
        description: "Renders a production app route that emits 1,000 simple text spans.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router+log enabled",
            caseName: "app render 1000 nodes",
            value: "1747",
            diff: "best",
            unit: "ops/sec",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router",
            caseName: "app render 1000 nodes",
            value: "1645",
            diff: "-5.84%",
            unit: "ops/sec",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app render 1000 nodes",
            value: "1044",
            diff: "-40.24%",
            unit: "ops/sec",
            isMreact: true
          },
          {
            rank: 4,
            framework: "marko-run",
            caseName: "app render 1000 nodes",
            value: "778",
            diff: "-55.47%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 5,
            framework: "tanstack-start",
            caseName: "app render 1000 nodes",
            value: "750",
            diff: "-57.07%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 6,
            framework: "qwik-city",
            caseName: "app render 1000 nodes",
            value: "483",
            diff: "-72.35%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 7,
            framework: "solid-start",
            caseName: "app render 1000 nodes",
            value: "400",
            diff: "-77.1%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 8,
            framework: "qwik-router-v2",
            caseName: "app render 1000 nodes",
            value: "379",
            diff: "-78.31%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 9,
            framework: "tanstack-start-solid",
            caseName: "app render 1000 nodes",
            value: "316",
            diff: "-81.91%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 10,
            framework: "next-app-router",
            caseName: "app render 1000 nodes",
            value: "86",
            diff: "-95.08%",
            unit: "ops/sec",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-streaming-1000-nodes",
        title: "app streaming 1000 nodes",
        description: "Streams a production app route with 1,000 simple text spans and validates the complete response body.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router+log enabled",
            caseName: "app streaming 1000 nodes",
            value: "1489",
            diff: "best",
            unit: "ops/sec",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router",
            caseName: "app streaming 1000 nodes",
            value: "1454",
            diff: "-2.35%",
            unit: "ops/sec",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app streaming 1000 nodes",
            value: "956",
            diff: "-35.8%",
            unit: "ops/sec",
            isMreact: true
          },
          {
            rank: 4,
            framework: "marko-run",
            caseName: "app streaming 1000 nodes",
            value: "955",
            diff: "-35.86%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 5,
            framework: "tanstack-start",
            caseName: "app streaming 1000 nodes",
            value: "763",
            diff: "-48.76%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 6,
            framework: "qwik-city",
            caseName: "app streaming 1000 nodes",
            value: "428",
            diff: "-71.26%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 7,
            framework: "solid-start",
            caseName: "app streaming 1000 nodes",
            value: "401",
            diff: "-73.07%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 8,
            framework: "tanstack-start-solid",
            caseName: "app streaming 1000 nodes",
            value: "332",
            diff: "-77.7%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 9,
            framework: "qwik-router-v2",
            caseName: "app streaming 1000 nodes",
            value: "316",
            diff: "-78.78%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 10,
            framework: "next-app-router",
            caseName: "app streaming 1000 nodes",
            value: "85",
            diff: "-94.29%",
            unit: "ops/sec",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-streaming-first-byte-1000-nodes",
        title: "app streaming first byte 1000 nodes",
        description: "Measures elapsed time until fetch resolves response headers for the real streaming route.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router+log enabled",
            caseName: "app streaming first byte 1000 nodes",
            value: "0.8292",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app streaming first byte 1000 nodes",
            value: "0.8315",
            diff: "+0.28%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router",
            caseName: "app streaming first byte 1000 nodes",
            value: "0.9128",
            diff: "+10.08%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 4,
            framework: "marko-run",
            caseName: "app streaming first byte 1000 nodes",
            value: "1.336",
            diff: "+61.12%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 5,
            framework: "qwik-city",
            caseName: "app streaming first byte 1000 nodes",
            value: "1.5675",
            diff: "+89.04%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "solid-start",
            caseName: "app streaming first byte 1000 nodes",
            value: "2.6062",
            diff: "+214.3%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "next-app-router",
            caseName: "app streaming first byte 1000 nodes",
            value: "3.0197",
            diff: "+264.17%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 8,
            framework: "tanstack-start",
            caseName: "app streaming first byte 1000 nodes",
            value: "52.5639",
            diff: "+6239.11%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 9,
            framework: "qwik-router-v2",
            caseName: "app streaming first byte 1000 nodes",
            value: "54.5581",
            diff: "+6479.61%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 10,
            framework: "tanstack-start-solid",
            caseName: "app streaming first byte 1000 nodes",
            value: "55.0799",
            diff: "+6542.53%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-streaming-first-chunk-1000-nodes",
        title: "app streaming first chunk 1000 nodes",
        description: "Measures elapsed time until the first response body chunk arrives for the real streaming route.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router+log enabled",
            caseName: "app streaming first chunk 1000 nodes",
            value: "0.8298",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app streaming first chunk 1000 nodes",
            value: "0.9052",
            diff: "+9.09%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router",
            caseName: "app streaming first chunk 1000 nodes",
            value: "0.9464",
            diff: "+14.05%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 4,
            framework: "marko-run",
            caseName: "app streaming first chunk 1000 nodes",
            value: "1.3682",
            diff: "+64.88%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 5,
            framework: "qwik-city",
            caseName: "app streaming first chunk 1000 nodes",
            value: "1.544",
            diff: "+86.07%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "solid-start",
            caseName: "app streaming first chunk 1000 nodes",
            value: "2.4892",
            diff: "+199.98%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "next-app-router",
            caseName: "app streaming first chunk 1000 nodes",
            value: "3.3614",
            diff: "+305.09%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 8,
            framework: "tanstack-start",
            caseName: "app streaming first chunk 1000 nodes",
            value: "52.2304",
            diff: "+6194.34%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 9,
            framework: "qwik-router-v2",
            caseName: "app streaming first chunk 1000 nodes",
            value: "54.2013",
            diff: "+6431.85%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 10,
            framework: "tanstack-start-solid",
            caseName: "app streaming first chunk 1000 nodes",
            value: "54.3816",
            diff: "+6453.58%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-streaming-full-body-1000-nodes",
        title: "app streaming full body 1000 nodes",
        description: "Measures elapsed time until the complete real streaming response body is consumed and validated.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app streaming full body 1000 nodes",
            value: "50.4785",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "marko-run",
            caseName: "app streaming full body 1000 nodes",
            value: "51.2355",
            diff: "+1.5%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 3,
            framework: "mreact-app-router+log enabled",
            caseName: "app streaming full body 1000 nodes",
            value: "51.2756",
            diff: "+1.58%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 4,
            framework: "mreact-app-router",
            caseName: "app streaming full body 1000 nodes",
            value: "51.3401",
            diff: "+1.71%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 5,
            framework: "tanstack-start",
            caseName: "app streaming full body 1000 nodes",
            value: "52.1231",
            diff: "+3.26%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "solid-start",
            caseName: "app streaming full body 1000 nodes",
            value: "52.6161",
            diff: "+4.23%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "qwik-city",
            caseName: "app streaming full body 1000 nodes",
            value: "53.16",
            diff: "+5.31%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 8,
            framework: "tanstack-start-solid",
            caseName: "app streaming full body 1000 nodes",
            value: "54.2855",
            diff: "+7.54%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 9,
            framework: "qwik-router-v2",
            caseName: "app streaming full body 1000 nodes",
            value: "54.4994",
            diff: "+7.97%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 10,
            framework: "next-app-router",
            caseName: "app streaming full body 1000 nodes",
            value: "60.181",
            diff: "+19.22%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-real-streaming-1000-nodes-async-50ms",
        title: "app real streaming 1000 nodes (async 50ms)",
        description: "Measures complete response latency for a route whose body waits on a 50 ms async boundary.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router",
            caseName: "app real streaming 1000 nodes (async 50ms)",
            value: "51.2493",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router+log enabled",
            caseName: "app real streaming 1000 nodes (async 50ms)",
            value: "51.2772",
            diff: "+0.05%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "marko-run",
            caseName: "app real streaming 1000 nodes (async 50ms)",
            value: "51.3198",
            diff: "+0.14%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 4,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app real streaming 1000 nodes (async 50ms)",
            value: "52.1092",
            diff: "+1.68%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 5,
            framework: "solid-start",
            caseName: "app real streaming 1000 nodes (async 50ms)",
            value: "52.1983",
            diff: "+1.85%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "tanstack-start",
            caseName: "app real streaming 1000 nodes (async 50ms)",
            value: "52.2801",
            diff: "+2.01%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "qwik-city",
            caseName: "app real streaming 1000 nodes (async 50ms)",
            value: "53.2166",
            diff: "+3.84%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 8,
            framework: "qwik-router-v2",
            caseName: "app real streaming 1000 nodes (async 50ms)",
            value: "54.5988",
            diff: "+6.54%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 9,
            framework: "tanstack-start-solid",
            caseName: "app real streaming 1000 nodes (async 50ms)",
            value: "54.7311",
            diff: "+6.79%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 10,
            framework: "next-app-router",
            caseName: "app real streaming 1000 nodes (async 50ms)",
            value: "59.9137",
            diff: "+16.91%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-parallel-async-boundaries-2x50ms",
        title: "app parallel async boundaries 2x50ms",
        description: "Measures complete response latency for two sibling 50 ms async boundaries; parallel renderers stay near one boundary.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router+log enabled",
            caseName: "app parallel async boundaries 2x50ms",
            value: "50.6579",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "marko-run",
            caseName: "app parallel async boundaries 2x50ms",
            value: "50.9436",
            diff: "+0.56%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 3,
            framework: "mreact-app-router",
            caseName: "app parallel async boundaries 2x50ms",
            value: "51.3333",
            diff: "+1.33%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 4,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app parallel async boundaries 2x50ms",
            value: "51.4208",
            diff: "+1.51%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 5,
            framework: "tanstack-start",
            caseName: "app parallel async boundaries 2x50ms",
            value: "51.8034",
            diff: "+2.26%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "solid-start",
            caseName: "app parallel async boundaries 2x50ms",
            value: "52.1809",
            diff: "+3.01%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "qwik-city",
            caseName: "app parallel async boundaries 2x50ms",
            value: "52.2229",
            diff: "+3.09%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 8,
            framework: "tanstack-start-solid",
            caseName: "app parallel async boundaries 2x50ms",
            value: "52.7969",
            diff: "+4.22%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 9,
            framework: "qwik-router-v2",
            caseName: "app parallel async boundaries 2x50ms",
            value: "53.0179",
            diff: "+4.66%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 10,
            framework: "next-app-router",
            caseName: "app parallel async boundaries 2x50ms",
            value: "53.4453",
            diff: "+5.5%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-static-cached-route-1000-nodes",
        title: "app static cached route 1000 nodes",
        description: "Renders a static-cacheable app route with 1,000 simple text spans after the production server has warmed it.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router+log enabled",
            caseName: "app static cached route 1000 nodes",
            value: "1602",
            diff: "best",
            unit: "ops/sec",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router",
            caseName: "app static cached route 1000 nodes",
            value: "1560",
            diff: "-2.62%",
            unit: "ops/sec",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app static cached route 1000 nodes",
            value: "1017",
            diff: "-36.52%",
            unit: "ops/sec",
            isMreact: true
          },
          {
            rank: 4,
            framework: "next-app-router",
            caseName: "app static cached route 1000 nodes",
            value: "414",
            diff: "-74.16%",
            unit: "ops/sec",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-dynamic-attr-grid-200-cells",
        title: "app dynamic-attr grid 200 cells",
        description: "Renders 200 cells with many dynamic escaped attributes, inline style values, and text content.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router",
            caseName: "app dynamic-attr grid 200 cells",
            value: "1095",
            diff: "best",
            unit: "ops/sec",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router+log enabled",
            caseName: "app dynamic-attr grid 200 cells",
            value: "1081",
            diff: "-1.28%",
            unit: "ops/sec",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app dynamic-attr grid 200 cells",
            value: "707",
            diff: "-35.43%",
            unit: "ops/sec",
            isMreact: true
          },
          {
            rank: 4,
            framework: "marko-run",
            caseName: "app dynamic-attr grid 200 cells",
            value: "586",
            diff: "-46.48%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 5,
            framework: "tanstack-start",
            caseName: "app dynamic-attr grid 200 cells",
            value: "525",
            diff: "-52.05%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 6,
            framework: "solid-start",
            caseName: "app dynamic-attr grid 200 cells",
            value: "451",
            diff: "-58.81%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 7,
            framework: "tanstack-start-solid",
            caseName: "app dynamic-attr grid 200 cells",
            value: "389",
            diff: "-64.47%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 8,
            framework: "qwik-city",
            caseName: "app dynamic-attr grid 200 cells",
            value: "340",
            diff: "-68.95%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 9,
            framework: "qwik-router-v2",
            caseName: "app dynamic-attr grid 200 cells",
            value: "231",
            diff: "-78.9%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 10,
            framework: "next-app-router",
            caseName: "app dynamic-attr grid 200 cells",
            value: "110",
            diff: "-89.95%",
            unit: "ops/sec",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-dynamic-route-params-data",
        title: "app dynamic route params data",
        description: "Renders a dynamic route that combines route parameters with server data before producing HTML.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app dynamic route params data",
            value: "1105",
            diff: "best",
            unit: "ops/sec",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router+log enabled",
            caseName: "app dynamic route params data",
            value: "1098",
            diff: "-0.63%",
            unit: "ops/sec",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router",
            caseName: "app dynamic route params data",
            value: "1092",
            diff: "-1.18%",
            unit: "ops/sec",
            isMreact: true
          },
          {
            rank: 4,
            framework: "marko-run",
            caseName: "app dynamic route params data",
            value: "593",
            diff: "-46.33%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 5,
            framework: "tanstack-start",
            caseName: "app dynamic route params data",
            value: "480",
            diff: "-56.56%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 6,
            framework: "solid-start",
            caseName: "app dynamic route params data",
            value: "445",
            diff: "-59.73%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 7,
            framework: "tanstack-start-solid",
            caseName: "app dynamic route params data",
            value: "364",
            diff: "-67.06%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 8,
            framework: "qwik-city",
            caseName: "app dynamic route params data",
            value: "330",
            diff: "-70.14%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 9,
            framework: "qwik-router-v2",
            caseName: "app dynamic route params data",
            value: "243",
            diff: "-78.01%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 10,
            framework: "next-app-router",
            caseName: "app dynamic route params data",
            value: "107",
            diff: "-90.32%",
            unit: "ops/sec",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-concurrent-throughput-100-connections",
        title: "app concurrent throughput 100 connections",
        description: "Runs a fixed burst against the production fixture with up to 100 concurrent requests and reports sustained request throughput.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router+log enabled",
            caseName: "app concurrent throughput 100 connections",
            value: "1145.6585",
            diff: "best",
            unit: "ops/sec",
            isMreact: true
          },
          {
            rank: 2,
            framework: "marko-run",
            caseName: "app concurrent throughput 100 connections",
            value: "1072.8265",
            diff: "-6.36%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 3,
            framework: "mreact-app-router",
            caseName: "app concurrent throughput 100 connections",
            value: "1072.7479",
            diff: "-6.36%",
            unit: "ops/sec",
            isMreact: true
          },
          {
            rank: 4,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app concurrent throughput 100 connections",
            value: "757.3458",
            diff: "-33.89%",
            unit: "ops/sec",
            isMreact: true
          },
          {
            rank: 5,
            framework: "tanstack-start",
            caseName: "app concurrent throughput 100 connections",
            value: "660.1768",
            diff: "-42.38%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 6,
            framework: "solid-start",
            caseName: "app concurrent throughput 100 connections",
            value: "560.7093",
            diff: "-51.06%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 7,
            framework: "qwik-city",
            caseName: "app concurrent throughput 100 connections",
            value: "488.8252",
            diff: "-57.33%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 8,
            framework: "tanstack-start-solid",
            caseName: "app concurrent throughput 100 connections",
            value: "421.2404",
            diff: "-63.23%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 9,
            framework: "qwik-router-v2",
            caseName: "app concurrent throughput 100 connections",
            value: "298.5578",
            diff: "-73.94%",
            unit: "ops/sec",
            isMreact: false
          },
          {
            rank: 10,
            framework: "next-app-router",
            caseName: "app concurrent throughput 100 connections",
            value: "82.4153",
            diff: "-92.81%",
            unit: "ops/sec",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-concurrent-p99-latency-100-connections",
        title: "app concurrent p99 latency 100 connections",
        description: "Runs the same concurrent request burst and reports per-request p99 latency, exposing event-loop stalls hidden by sequential tinybench runs.",
        rows: [
          {
            rank: 1,
            framework: "marko-run",
            caseName: "app concurrent p99 latency 100 connections",
            value: "112.207",
            diff: "best",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 2,
            framework: "mreact-app-router+log enabled",
            caseName: "app concurrent p99 latency 100 connections",
            value: "162.8321",
            diff: "+45.12%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router",
            caseName: "app concurrent p99 latency 100 connections",
            value: "173.2628",
            diff: "+54.41%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 4,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app concurrent p99 latency 100 connections",
            value: "247.1917",
            diff: "+120.3%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 5,
            framework: "tanstack-start",
            caseName: "app concurrent p99 latency 100 connections",
            value: "273.7627",
            diff: "+143.98%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "solid-start",
            caseName: "app concurrent p99 latency 100 connections",
            value: "319.1507",
            diff: "+184.43%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "qwik-city",
            caseName: "app concurrent p99 latency 100 connections",
            value: "332.1971",
            diff: "+196.06%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 8,
            framework: "tanstack-start-solid",
            caseName: "app concurrent p99 latency 100 connections",
            value: "461.5917",
            diff: "+311.38%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 9,
            framework: "qwik-router-v2",
            caseName: "app concurrent p99 latency 100 connections",
            value: "566.6305",
            diff: "+404.99%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 10,
            framework: "next-app-router",
            caseName: "app concurrent p99 latency 100 connections",
            value: "2414.7577",
            diff: "+2052.06%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-concurrent-rss-delta-100-connections",
        title: "app concurrent RSS delta 100 connections",
        description: "Reports RSS growth across the concurrent request burst so sustained-load memory trends are visible in router benchmark output.",
        rows: [
          {
            rank: 1,
            framework: "qwik-city",
            caseName: "app concurrent RSS delta 100 connections",
            value: "0",
            diff: "",
            unit: "bytes",
            isMreact: false
          },
          {
            rank: 2,
            framework: "qwik-router-v2",
            caseName: "app concurrent RSS delta 100 connections",
            value: "0",
            diff: "",
            unit: "bytes",
            isMreact: false
          },
          {
            rank: 3,
            framework: "tanstack-start",
            caseName: "app concurrent RSS delta 100 connections",
            value: "0",
            diff: "",
            unit: "bytes",
            isMreact: false
          },
          {
            rank: 4,
            framework: "marko-run",
            caseName: "app concurrent RSS delta 100 connections",
            value: "262144",
            diff: "",
            unit: "bytes",
            isMreact: false
          },
          {
            rank: 5,
            framework: "tanstack-start-solid",
            caseName: "app concurrent RSS delta 100 connections",
            value: "1048576",
            diff: "",
            unit: "bytes",
            isMreact: false
          },
          {
            rank: 6,
            framework: "mreact-app-router",
            caseName: "app concurrent RSS delta 100 connections",
            value: "1265664",
            diff: "",
            unit: "bytes",
            isMreact: true
          },
          {
            rank: 7,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app concurrent RSS delta 100 connections",
            value: "2228224",
            diff: "",
            unit: "bytes",
            isMreact: true
          },
          {
            rank: 8,
            framework: "solid-start",
            caseName: "app concurrent RSS delta 100 connections",
            value: "4456448",
            diff: "",
            unit: "bytes",
            isMreact: false
          },
          {
            rank: 9,
            framework: "mreact-app-router+log enabled",
            caseName: "app concurrent RSS delta 100 connections",
            value: "9175040",
            diff: "",
            unit: "bytes",
            isMreact: true
          },
          {
            rank: 10,
            framework: "next-app-router",
            caseName: "app concurrent RSS delta 100 connections",
            value: "90431488",
            diff: "",
            unit: "bytes",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-loader-client-navigation-route-to-route",
        title: "app loader client navigation route-to-route",
        description: "Measures browser client navigation to a route with loader data, covering data-bearing SPA transitions.",
        rows: [
          {
            rank: 1,
            framework: "solid-start",
            caseName: "app loader client navigation route-to-route",
            value: "50.5",
            diff: "best",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 2,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app loader client navigation route-to-route",
            value: "50.9",
            diff: "+0.79%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+log enabled",
            caseName: "app loader client navigation route-to-route",
            value: "55.8",
            diff: "+10.5%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 4,
            framework: "mreact-app-router",
            caseName: "app loader client navigation route-to-route",
            value: "55.9",
            diff: "+10.69%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 5,
            framework: "next-app-router",
            caseName: "app loader client navigation route-to-route",
            value: "63.4",
            diff: "+25.54%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "qwik-router-v2",
            caseName: "app loader client navigation route-to-route",
            value: "97",
            diff: "+92.08%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "tanstack-start",
            caseName: "app loader client navigation route-to-route",
            value: "99",
            diff: "+96.04%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 8,
            framework: "qwik-city",
            caseName: "app loader client navigation route-to-route",
            value: "106.3",
            diff: "+110.5%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-client-navigation-back-forward-restore",
        title: "app client navigation back-forward restore",
        description: "Measures browser back-forward restoration after SPA navigation so history snapshot regressions are visible.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router",
            caseName: "app client navigation back-forward restore",
            value: "7.4",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "solid-start",
            caseName: "app client navigation back-forward restore",
            value: "7.5",
            diff: "+1.35%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 3,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app client navigation back-forward restore",
            value: "7.7",
            diff: "+4.05%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 4,
            framework: "mreact-app-router+log enabled",
            caseName: "app client navigation back-forward restore",
            value: "7.8",
            diff: "+5.41%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 5,
            framework: "next-app-router",
            caseName: "app client navigation back-forward restore",
            value: "9.2",
            diff: "+24.32%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "tanstack-start",
            caseName: "app client navigation back-forward restore",
            value: "10.2",
            diff: "+37.84%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "qwik-city",
            caseName: "app client navigation back-forward restore",
            value: "105.9",
            diff: "+1331.08%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 8,
            framework: "qwik-router-v2",
            caseName: "app client navigation back-forward restore",
            value: "109.5",
            diff: "+1379.73%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-client-navigation-route-to-route",
        title: "app client navigation route-to-route",
        description: "Measures route-to-route client navigation latency in a real browser when the adapter provides a browser probe.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app client navigation route-to-route",
            value: "54.3",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "solid-start",
            caseName: "app client navigation route-to-route",
            value: "54.9",
            diff: "+1.1%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 3,
            framework: "mreact-app-router+log enabled",
            caseName: "app client navigation route-to-route",
            value: "54.9",
            diff: "+1.1%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 4,
            framework: "mreact-app-router",
            caseName: "app client navigation route-to-route",
            value: "55.1",
            diff: "+1.47%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 5,
            framework: "tanstack-start",
            caseName: "app client navigation route-to-route",
            value: "56.4",
            diff: "+3.87%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "next-app-router",
            caseName: "app client navigation route-to-route",
            value: "57.7",
            diff: "+6.26%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "qwik-city",
            caseName: "app client navigation route-to-route",
            value: "100.8",
            diff: "+85.64%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 8,
            framework: "qwik-router-v2",
            caseName: "app client navigation route-to-route",
            value: "116.9",
            diff: "+115.29%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-initial-page-load-js-before-interaction",
        title: "app initial page load JS before interaction",
        description: "Measures page load time until the interactive route is visible and idle before any user interaction.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router",
            caseName: "app initial page load JS before interaction",
            value: "534.0011",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router+log enabled",
            caseName: "app initial page load JS before interaction",
            value: "535.5027",
            diff: "+0.28%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app initial page load JS before interaction",
            value: "535.7579",
            diff: "+0.33%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 4,
            framework: "marko-run",
            caseName: "app initial page load JS before interaction",
            value: "537.2283",
            diff: "+0.6%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 5,
            framework: "solid-start",
            caseName: "app initial page load JS before interaction",
            value: "542.8704",
            diff: "+1.66%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "tanstack-start",
            caseName: "app initial page load JS before interaction",
            value: "545.8187",
            diff: "+2.21%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "qwik-city",
            caseName: "app initial page load JS before interaction",
            value: "563.4449",
            diff: "+5.51%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 8,
            framework: "qwik-router-v2",
            caseName: "app initial page load JS before interaction",
            value: "567.2574",
            diff: "+6.23%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 9,
            framework: "next-app-router",
            caseName: "app initial page load JS before interaction",
            value: "621.0574",
            diff: "+16.3%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-first-interaction-from-domcontentloaded",
        title: "app first interaction from DOMContentLoaded",
        description: "Measures the first click-to-visible-update latency immediately after DOMContentLoaded without waiting for network idle.",
        rows: [
          {
            rank: 1,
            framework: "tanstack-start",
            caseName: "app first interaction from DOMContentLoaded",
            value: "18.2",
            diff: "best",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 2,
            framework: "solid-start",
            caseName: "app first interaction from DOMContentLoaded",
            value: "24.9",
            diff: "+36.81%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 3,
            framework: "mreact-app-router",
            caseName: "app first interaction from DOMContentLoaded",
            value: "29.5",
            diff: "+62.09%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 4,
            framework: "mreact-app-router+log enabled",
            caseName: "app first interaction from DOMContentLoaded",
            value: "29.6",
            diff: "+62.64%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 5,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app first interaction from DOMContentLoaded",
            value: "29.8",
            diff: "+63.74%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 6,
            framework: "marko-run",
            caseName: "app first interaction from DOMContentLoaded",
            value: "37.3",
            diff: "+104.95%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 7,
            framework: "next-app-router",
            caseName: "app first interaction from DOMContentLoaded",
            value: "44",
            diff: "+141.76%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 8,
            framework: "qwik-router-v2",
            caseName: "app first interaction from DOMContentLoaded",
            value: "60.8",
            diff: "+234.07%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 9,
            framework: "qwik-city",
            caseName: "app first interaction from DOMContentLoaded",
            value: "65.3",
            diff: "+258.79%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-first-interaction-after-networkidle",
        title: "app first interaction after networkidle",
        description: "Measures the first click-to-visible-update latency after the interactive route has reached network idle.",
        rows: [
          {
            rank: 1,
            framework: "marko-run",
            caseName: "app first interaction after networkidle",
            value: "21.7",
            diff: "best",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 2,
            framework: "mreact-app-router+log enabled",
            caseName: "app first interaction after networkidle",
            value: "23.2",
            diff: "+6.91%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router",
            caseName: "app first interaction after networkidle",
            value: "23.6",
            diff: "+8.76%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 4,
            framework: "next-app-router",
            caseName: "app first interaction after networkidle",
            value: "24.9",
            diff: "+14.75%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 5,
            framework: "solid-start",
            caseName: "app first interaction after networkidle",
            value: "25.1",
            diff: "+15.67%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app first interaction after networkidle",
            value: "25.5",
            diff: "+17.51%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 7,
            framework: "tanstack-start",
            caseName: "app first interaction after networkidle",
            value: "27.3",
            diff: "+25.81%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 8,
            framework: "qwik-router-v2",
            caseName: "app first interaction after networkidle",
            value: "43.4",
            diff: "+100%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 9,
            framework: "qwik-city",
            caseName: "app first interaction after networkidle",
            value: "51",
            diff: "+135.02%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-second-interaction-latency",
        title: "app second interaction latency",
        description: "Measures the second click-to-visible-update latency after the route has already handled one client interaction.",
        rows: [
          {
            rank: 1,
            framework: "qwik-router-v2",
            caseName: "app second interaction latency",
            value: "25.5",
            diff: "best",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 2,
            framework: "tanstack-start",
            caseName: "app second interaction latency",
            value: "29.8",
            diff: "+16.86%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 3,
            framework: "next-app-router",
            caseName: "app second interaction latency",
            value: "29.9",
            diff: "+17.25%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 4,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app second interaction latency",
            value: "30.2",
            diff: "+18.43%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 5,
            framework: "solid-start",
            caseName: "app second interaction latency",
            value: "30.8",
            diff: "+20.78%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 6,
            framework: "mreact-app-router+log enabled",
            caseName: "app second interaction latency",
            value: "30.8",
            diff: "+20.78%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 7,
            framework: "mreact-app-router",
            caseName: "app second interaction latency",
            value: "30.9",
            diff: "+21.18%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 8,
            framework: "marko-run",
            caseName: "app second interaction latency",
            value: "31.2",
            diff: "+22.35%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 9,
            framework: "qwik-city",
            caseName: "app second interaction latency",
            value: "48.4",
            diff: "+89.8%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-ssr-html-gzip-bytes-1000-nodes",
        title: "app SSR HTML gzip bytes 1000 nodes",
        description: "Measures gzip-compressed HTML payload bytes for the 1,000-node SSR route, complementing client bundle size cases.",
        rows: [
          {
            rank: 1,
            framework: "marko-run",
            caseName: "app SSR HTML gzip bytes 1000 nodes",
            value: "2291",
            diff: "best",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 2,
            framework: "mreact-app-router",
            caseName: "app SSR HTML gzip bytes 1000 nodes",
            value: "2301",
            diff: "+0.44%",
            unit: "gzip bytes",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app SSR HTML gzip bytes 1000 nodes",
            value: "2301",
            diff: "+0.44%",
            unit: "gzip bytes",
            isMreact: true
          },
          {
            rank: 4,
            framework: "mreact-app-router+log enabled",
            caseName: "app SSR HTML gzip bytes 1000 nodes",
            value: "2301",
            diff: "+0.44%",
            unit: "gzip bytes",
            isMreact: true
          },
          {
            rank: 5,
            framework: "tanstack-start",
            caseName: "app SSR HTML gzip bytes 1000 nodes",
            value: "3516",
            diff: "+53.47%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 6,
            framework: "qwik-city",
            caseName: "app SSR HTML gzip bytes 1000 nodes",
            value: "6099",
            diff: "+166.22%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 7,
            framework: "qwik-router-v2",
            caseName: "app SSR HTML gzip bytes 1000 nodes",
            value: "6927",
            diff: "+202.36%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 8,
            framework: "solid-start",
            caseName: "app SSR HTML gzip bytes 1000 nodes",
            value: "9346",
            diff: "+307.94%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 9,
            framework: "tanstack-start-solid",
            caseName: "app SSR HTML gzip bytes 1000 nodes",
            value: "9785",
            diff: "+327.11%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 10,
            framework: "next-app-router",
            caseName: "app SSR HTML gzip bytes 1000 nodes",
            value: "14923",
            diff: "+551.37%",
            unit: "gzip bytes",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-client-bundle-gzip-bytes-server-only-page",
        title: "app client bundle gzip bytes (server-only page)",
        description: "Measures gzip-compressed client JavaScript shipped for a route with no user-authored interactivity.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router",
            caseName: "app client bundle gzip bytes (server-only page)",
            value: "0",
            diff: "",
            unit: "gzip bytes",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app client bundle gzip bytes (server-only page)",
            value: "0",
            diff: "",
            unit: "gzip bytes",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+log enabled",
            caseName: "app client bundle gzip bytes (server-only page)",
            value: "0",
            diff: "",
            unit: "gzip bytes",
            isMreact: true
          },
          {
            rank: 4,
            framework: "marko-run",
            caseName: "app client bundle gzip bytes (server-only page)",
            value: "1600",
            diff: "",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 5,
            framework: "solid-start",
            caseName: "app client bundle gzip bytes (server-only page)",
            value: "20211",
            diff: "",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 6,
            framework: "qwik-city",
            caseName: "app client bundle gzip bytes (server-only page)",
            value: "25534",
            diff: "",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 7,
            framework: "qwik-router-v2",
            caseName: "app client bundle gzip bytes (server-only page)",
            value: "51246",
            diff: "",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 8,
            framework: "tanstack-start-solid",
            caseName: "app client bundle gzip bytes (server-only page)",
            value: "57974",
            diff: "",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 9,
            framework: "tanstack-start",
            caseName: "app client bundle gzip bytes (server-only page)",
            value: "104797",
            diff: "",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 10,
            framework: "next-app-router",
            caseName: "app client bundle gzip bytes (server-only page)",
            value: "145611",
            diff: "",
            unit: "gzip bytes",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-client-bundle-gzip-bytes-interactive-page",
        title: "app client bundle gzip bytes (interactive page)",
        description: "Measures gzip-compressed client JavaScript shipped for a minimal button-and-state interactive route.",
        rows: [
          {
            rank: 1,
            framework: "marko-run",
            caseName: "app client bundle gzip bytes (interactive page)",
            value: "2509",
            diff: "best",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 2,
            framework: "mreact-app-router",
            caseName: "app client bundle gzip bytes (interactive page)",
            value: "9984",
            diff: "+297.93%",
            unit: "gzip bytes",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+log enabled",
            caseName: "app client bundle gzip bytes (interactive page)",
            value: "9984",
            diff: "+297.93%",
            unit: "gzip bytes",
            isMreact: true
          },
          {
            rank: 4,
            framework: "solid-start",
            caseName: "app client bundle gzip bytes (interactive page)",
            value: "19241",
            diff: "+666.88%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 5,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app client bundle gzip bytes (interactive page)",
            value: "34010",
            diff: "+1255.52%",
            unit: "gzip bytes",
            isMreact: true
          },
          {
            rank: 6,
            framework: "qwik-city",
            caseName: "app client bundle gzip bytes (interactive page)",
            value: "35114",
            diff: "+1299.52%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 7,
            framework: "qwik-router-v2",
            caseName: "app client bundle gzip bytes (interactive page)",
            value: "52899",
            diff: "+2008.37%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 8,
            framework: "tanstack-start-solid",
            caseName: "app client bundle gzip bytes (interactive page)",
            value: "56111",
            diff: "+2136.39%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 9,
            framework: "tanstack-start",
            caseName: "app client bundle gzip bytes (interactive page)",
            value: "103195",
            diff: "+4012.99%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 10,
            framework: "next-app-router",
            caseName: "app client bundle gzip bytes (interactive page)",
            value: "149261",
            diff: "+5849.02%",
            unit: "gzip bytes",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-client-bundle-gzip-bytes-interactive-page-minimal-opt-out",
        title: "app client bundle gzip bytes (interactive page, minimal opt-out)",
        description: "Measures the same interactive route while opting out of optional client navigation runtime where the framework supports it.",
        rows: [
          {
            rank: 1,
            framework: "marko-run",
            caseName: "app client bundle gzip bytes (interactive page, minimal opt-out)",
            value: "2509",
            diff: "best",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 2,
            framework: "mreact-app-router",
            caseName: "app client bundle gzip bytes (interactive page, minimal opt-out)",
            value: "5574",
            diff: "+122.16%",
            unit: "gzip bytes",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+log enabled",
            caseName: "app client bundle gzip bytes (interactive page, minimal opt-out)",
            value: "5574",
            diff: "+122.16%",
            unit: "gzip bytes",
            isMreact: true
          },
          {
            rank: 4,
            framework: "solid-start",
            caseName: "app client bundle gzip bytes (interactive page, minimal opt-out)",
            value: "19241",
            diff: "+666.88%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 5,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app client bundle gzip bytes (interactive page, minimal opt-out)",
            value: "29723",
            diff: "+1084.66%",
            unit: "gzip bytes",
            isMreact: true
          },
          {
            rank: 6,
            framework: "qwik-city",
            caseName: "app client bundle gzip bytes (interactive page, minimal opt-out)",
            value: "35114",
            diff: "+1299.52%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 7,
            framework: "qwik-router-v2",
            caseName: "app client bundle gzip bytes (interactive page, minimal opt-out)",
            value: "52899",
            diff: "+2008.37%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 8,
            framework: "tanstack-start-solid",
            caseName: "app client bundle gzip bytes (interactive page, minimal opt-out)",
            value: "56111",
            diff: "+2136.39%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 9,
            framework: "tanstack-start",
            caseName: "app client bundle gzip bytes (interactive page, minimal opt-out)",
            value: "103195",
            diff: "+4012.99%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 10,
            framework: "next-app-router",
            caseName: "app client bundle gzip bytes (interactive page, minimal opt-out)",
            value: "149261",
            diff: "+5849.02%",
            unit: "gzip bytes",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-build-output-gzip-bytes",
        title: "app build output gzip bytes",
        description: "Measures gzip-compressed production build output size when the adapter exposes build artifacts.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router+log enabled",
            caseName: "app build output gzip bytes",
            value: "65289",
            diff: "best",
            unit: "gzip bytes",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router",
            caseName: "app build output gzip bytes",
            value: "65307",
            diff: "+0.03%",
            unit: "gzip bytes",
            isMreact: true
          },
          {
            rank: 3,
            framework: "marko-run",
            caseName: "app build output gzip bytes",
            value: "77134",
            diff: "+18.14%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 4,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app build output gzip bytes",
            value: "101437",
            diff: "+55.37%",
            unit: "gzip bytes",
            isMreact: true
          },
          {
            rank: 5,
            framework: "tanstack-start-solid",
            caseName: "app build output gzip bytes",
            value: "152519",
            diff: "+133.61%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 6,
            framework: "tanstack-start",
            caseName: "app build output gzip bytes",
            value: "160536",
            diff: "+145.89%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 7,
            framework: "solid-start",
            caseName: "app build output gzip bytes",
            value: "167581",
            diff: "+156.68%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 8,
            framework: "qwik-router-v2",
            caseName: "app build output gzip bytes",
            value: "181229",
            diff: "+177.58%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 9,
            framework: "qwik-city",
            caseName: "app build output gzip bytes",
            value: "278295",
            diff: "+326.25%",
            unit: "gzip bytes",
            isMreact: false
          },
          {
            rank: 10,
            framework: "next-app-router",
            caseName: "app build output gzip bytes",
            value: "418643",
            diff: "+541.22%",
            unit: "gzip bytes",
            isMreact: false
          }
        ]
      },
      {
        id: "router-app-hydration-100-islands",
        title: "app hydration 100 islands",
        description: "Loads an app route with 100 independently interactive islands and reports time until all islands can update in real Chromium. This section currently compares mreact app-router variants only; it is not a cross-framework ranking.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app hydration 100 islands",
            value: "852.3892",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router",
            caseName: "app hydration 100 islands",
            value: "857.7979",
            diff: "+0.63%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+log enabled",
            caseName: "app hydration 100 islands",
            value: "868.5939",
            diff: "+1.9%",
            unit: "ms",
            isMreact: true
          }
        ]
      },
      {
        id: "router-app-dev-cold-start",
        title: "app dev cold start",
        description: "Starts the framework dev server for a minimal app and reports server readiness latency. This section currently compares mreact app-router variants only; it is not a cross-framework ranking.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router+log enabled",
            caseName: "app dev cold start",
            value: "4.2263",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app dev cold start",
            value: "4.6125",
            diff: "+9.14%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router",
            caseName: "app dev cold start",
            value: "17.8292",
            diff: "+321.86%",
            unit: "ms",
            isMreact: true
          }
        ]
      },
      {
        id: "router-app-dev-first-request-latency",
        title: "app dev first request latency",
        description: "Requests a minimal app route from a warm dev server and reports first request latency. This section currently compares mreact app-router variants only; it is not a cross-framework ranking.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router+log enabled",
            caseName: "app dev first request latency",
            value: "36.6638",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router",
            caseName: "app dev first request latency",
            value: "61.1229",
            diff: "+66.71%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app dev first request latency",
            value: "91.495",
            diff: "+149.55%",
            unit: "ms",
            isMreact: true
          }
        ]
      },
      {
        id: "router-app-dev-hmr-update-latency",
        title: "app dev HMR update latency",
        description: "Edits a route module while the dev server is running and reports time until the changed response is observable. This section currently compares mreact app-router variants only; it is not a cross-framework ranking.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router+log enabled",
            caseName: "app dev HMR update latency",
            value: "28.3963",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router",
            caseName: "app dev HMR update latency",
            value: "33.8203",
            diff: "+19.1%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app dev HMR update latency",
            value: "71.6616",
            diff: "+152.36%",
            unit: "ms",
            isMreact: true
          }
        ]
      },
      {
        id: "router-app-1000-route-match-latency",
        title: "app 1000 route match latency",
        description: "Builds a 1,000-route app and reports request latency for a route near the end of the route table. This section currently compares mreact app-router variants only; it is not a cross-framework ranking.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router",
            caseName: "app 1000 route match latency",
            value: "8.0991",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app 1000 route match latency",
            value: "13.7556",
            diff: "+69.84%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+log enabled",
            caseName: "app 1000 route match latency",
            value: "14.5807",
            diff: "+80.03%",
            unit: "ms",
            isMreact: true
          }
        ]
      },
      {
        id: "router-app-1000-route-cold-start",
        title: "app 1000 route cold start",
        description: "Builds a 1,000-route app and reports production server cold-start latency for that route scale. This section currently compares mreact app-router variants only; it is not a cross-framework ranking.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router",
            caseName: "app 1000 route cold start",
            value: "448.4299",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app 1000 route cold start",
            value: "453.6082",
            diff: "+1.15%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+log enabled",
            caseName: "app 1000 route cold start",
            value: "454.3523",
            diff: "+1.32%",
            unit: "ms",
            isMreact: true
          }
        ]
      },
      {
        id: "router-app-1000-route-build-time",
        title: "app 1000 route build time",
        description: "Reports production build time for a 1,000-route app to catch route-count scaling regressions. This section currently compares mreact app-router variants only; it is not a cross-framework ranking.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router",
            caseName: "app 1000 route build time",
            value: "14214.4444",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router+log enabled",
            caseName: "app 1000 route build time",
            value: "22350.7267",
            diff: "+57.24%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app 1000 route build time",
            value: "45179.1644",
            diff: "+217.84%",
            unit: "ms",
            isMreact: true
          }
        ]
      },
      {
        id: "router-app-1000-route-rss-delta",
        title: "app 1000 route RSS delta",
        description: "Reports process RSS growth while building and serving a 1,000-route app. This section currently compares mreact app-router variants only; it is not a cross-framework ranking.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router+log enabled",
            caseName: "app 1000 route RSS delta",
            value: "304771072",
            diff: "best",
            unit: "bytes",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router",
            caseName: "app 1000 route RSS delta",
            value: "632307712",
            diff: "+107.47%",
            unit: "bytes",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app 1000 route RSS delta",
            value: "1280790528",
            diff: "+320.25%",
            unit: "bytes",
            isMreact: true
          }
        ]
      },
      {
        id: "router-app-server-action-form-post-roundtrip",
        title: "app server action form POST roundtrip",
        description: "Renders a form with an inferred server action, submits the encoded form POST, and reports action roundtrip latency. This section currently compares mreact app-router variants only; it is not a cross-framework ranking.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router+log enabled",
            caseName: "app server action form POST roundtrip",
            value: "43.9207",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app server action form POST roundtrip",
            value: "44.143",
            diff: "+0.51%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router",
            caseName: "app server action form POST roundtrip",
            value: "49.8595",
            diff: "+13.52%",
            unit: "ms",
            isMreact: true
          }
        ]
      },
      {
        id: "router-app-nested-layouts-depth-5",
        title: "app nested layouts depth 5",
        description: "Renders a route under five nested layouts, guarding against sequential layout shell regressions. This section currently compares mreact app-router variants only; it is not a cross-framework ranking.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router",
            caseName: "app nested layouts depth 5",
            value: "35.183",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router+log enabled",
            caseName: "app nested layouts depth 5",
            value: "35.9758",
            diff: "+2.25%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app nested layouts depth 5",
            value: "37.2949",
            diff: "+6%",
            unit: "ms",
            isMreact: true
          }
        ]
      },
      {
        id: "router-app-cloudflare-worker-request-latency",
        title: "app Cloudflare Worker request latency",
        description: "Builds the Cloudflare Pages worker bundle and reports request latency through its exported fetch handler. A workerd/Miniflare harness should replace this fallback once the local workerd path-resolution failure is fixed. This section currently compares mreact app-router variants only; it is not a cross-framework ranking.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router+log enabled",
            caseName: "app Cloudflare Worker request latency",
            value: "2.687",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router",
            caseName: "app Cloudflare Worker request latency",
            value: "3.1565",
            diff: "+17.47%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app Cloudflare Worker request latency",
            value: "3.5764",
            diff: "+33.1%",
            unit: "ms",
            isMreact: true
          }
        ]
      },
      {
        id: "router-app-server-cold-start",
        title: "app server cold start",
        description: "Measures production server cold-start latency when the adapter can isolate startup from build work. This section currently compares mreact app-router variants only; it is not a cross-framework ranking.",
        rows: [
          {
            rank: 1,
            framework: "mreact-app-router",
            caseName: "app server cold start",
            value: "262.7312",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "mreact-app-router+mreact react-compat",
            caseName: "app server cold start",
            value: "263.8373",
            diff: "+0.42%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact-app-router+log enabled",
            caseName: "app server cold start",
            value: "263.9009",
            diff: "+0.45%",
            unit: "ms",
            isMreact: true
          }
        ]
      }
    ]
  },
  {
    id: "primitive-browser",
    title: "Primitive browser benchmarks",
    source: "primitive-browser.md",
    cardCount: 4,
    cards: [
      {
        id: "primitive-browser-browser-create-1k-rows",
        title: "browser create 1k rows",
        description: "Creates 1,000 keyed DOM rows in real Chromium, mirroring the primitive create case without happy-dom.",
        rows: [
          {
            rank: 1,
            framework: "solid",
            caseName: "browser create 1k rows",
            value: "1.5",
            diff: "best",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 2,
            framework: "qwik",
            caseName: "browser create 1k rows",
            value: "2.4",
            diff: "+60%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 3,
            framework: "mreact",
            caseName: "browser create 1k rows",
            value: "2.5",
            diff: "+66.67%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 4,
            framework: "react",
            caseName: "browser create 1k rows",
            value: "3.1",
            diff: "+106.67%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 5,
            framework: "mreact react-compat",
            caseName: "browser create 1k rows",
            value: "4.5",
            diff: "+200%",
            unit: "ms",
            isMreact: true
          }
        ]
      },
      {
        id: "primitive-browser-browser-update-every-10th-in-10k-rows",
        title: "browser update every 10th in 10k rows",
        description: "Updates every tenth row in a 10,000-row keyed DOM in real Chromium, exposing real DOM update costs hidden by happy-dom.",
        rows: [
          {
            rank: 1,
            framework: "mreact",
            caseName: "browser update every 10th in 10k rows",
            value: "1.3",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "react",
            caseName: "browser update every 10th in 10k rows",
            value: "2.7",
            diff: "+107.69%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 3,
            framework: "solid",
            caseName: "browser update every 10th in 10k rows",
            value: "7.6",
            diff: "+484.62%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 4,
            framework: "qwik",
            caseName: "browser update every 10th in 10k rows",
            value: "10.2",
            diff: "+684.62%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 5,
            framework: "mreact react-compat",
            caseName: "browser update every 10th in 10k rows",
            value: "14.9",
            diff: "+1046.15%",
            unit: "ms",
            isMreact: true
          }
        ]
      },
      {
        id: "primitive-browser-browser-select-row-in-10k-rows",
        title: "browser select row in 10k rows",
        description: "Toggles selection attributes for one row in a 10,000-row keyed DOM in real Chromium.",
        rows: [
          {
            rank: 1,
            framework: "mreact",
            caseName: "browser select row in 10k rows",
            value: "0.9",
            diff: "best",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 2,
            framework: "solid",
            caseName: "browser select row in 10k rows",
            value: "0.9",
            diff: "0%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 3,
            framework: "react",
            caseName: "browser select row in 10k rows",
            value: "2.7",
            diff: "+200%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 4,
            framework: "mreact react-compat",
            caseName: "browser select row in 10k rows",
            value: "7.8",
            diff: "+766.67%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 5,
            framework: "qwik",
            caseName: "browser select row in 10k rows",
            value: "8.9",
            diff: "+888.89%",
            unit: "ms",
            isMreact: false
          }
        ]
      },
      {
        id: "primitive-browser-browser-clear-10k-rows",
        title: "browser clear 10k rows",
        description: "Clears a 10,000-row keyed DOM in real Chromium to validate happy-dom clear rankings against browser behavior.",
        rows: [
          {
            rank: 1,
            framework: "solid",
            caseName: "browser clear 10k rows",
            value: "2.4",
            diff: "best",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 2,
            framework: "mreact",
            caseName: "browser clear 10k rows",
            value: "2.5",
            diff: "+4.17%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 3,
            framework: "mreact react-compat",
            caseName: "browser clear 10k rows",
            value: "4.3",
            diff: "+79.17%",
            unit: "ms",
            isMreact: true
          },
          {
            rank: 4,
            framework: "qwik",
            caseName: "browser clear 10k rows",
            value: "5.9",
            diff: "+145.83%",
            unit: "ms",
            isMreact: false
          },
          {
            rank: 5,
            framework: "react",
            caseName: "browser clear 10k rows",
            value: "15.5",
            diff: "+545.83%",
            unit: "ms",
            isMreact: false
          }
        ]
      }
    ]
  }
];
