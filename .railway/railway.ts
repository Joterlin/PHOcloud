import { defineRailway, github, project, service, volume } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "PHOcloud";
export default defineRailway(() => {
  // Keep the existing Railway volume attached. Omitting this resource during
  // migration would detach /app/storage and make persisted data unavailable.
  const storage = volume("phocloud-volume", {
    region: "ams",
    sizeMB: 500,
  });

  const PHOcloud = service("PHOcloud", {
    source: github("Joterlin/PHOcloud", { branch: "main", upstreamUrl: "https://github.com/Joterlin/PHOcloud" }),
    build: { buildEnvironment: "V3", builder: "RAILPACK", dockerfilePath: "Dockerfile" },
    healthcheck: "/healthz",
    healthcheckTimeout: 120,
    replicas: { "ams": 1 },
    deploy: {
      sleepApplication: true,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
    },
    domains: [{ domain: "straclase.com", port: 3000 }],
    networking: { privateNetworkEndpoint: "phocloud" },
    volumeMounts: { "/app/storage": storage },
  });

  return project("lively-peace", {
    variables: { managed: false },
    resources: [storage, PHOcloud],
  });
});
