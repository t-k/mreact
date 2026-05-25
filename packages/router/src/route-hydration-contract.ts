export const routeHydrationContract = {
  clientReferencesScriptPrefix: "mreact-client-references-",
  hydratedAttribute: "data-mreact-hydrated",
  hotRouteHydrateExport: "__mreactHotHydrateRoute",
  propsScriptPrefix: "mreact-props-",
  routeHydrateExport: "__mreactHydrateRoute",
  routeMarkerAttribute: "data-mreact-route-id",
} as const;

export function routeDataScriptIds(routeId: string): [string, string] {
  return [
    `${routeHydrationContract.propsScriptPrefix}${routeId}`,
    `${routeHydrationContract.clientReferencesScriptPrefix}${routeId}`,
  ];
}

export function routeDataScriptSelector(): string {
  return [
    `script[type="application/json"][id^="${routeHydrationContract.propsScriptPrefix}"]`,
    `script[type="application/json"][id^="${routeHydrationContract.clientReferencesScriptPrefix}"]`,
  ].join(", ");
}
