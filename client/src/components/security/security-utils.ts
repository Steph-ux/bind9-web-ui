export function splitAclNetworks(networks: string) {
    return networks
        .split(/[;\r\n]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

export function normalizeAclNetworks(networks: string) {
    const items = splitAclNetworks(networks);
    return items.length > 0 ? `${items.join(";\n")};` : "";
}

export function isMaskedSecret(secret: string) {
    return secret.includes("[hidden]");
}
