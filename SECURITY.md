# Security Policy

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/calmtechltd/calmtech-marketplace/security/advisories/new). Do not put credentials, customer data, exploit details, or private repository information in a public issue.

## Publication boundary

The marketplace contains references to public repositories explicitly listed in `plugins.json`. The generator writes catalog metadata locally without fetching repositories, copying plugin contents, installing dependencies or executing plugin code.

Agent hosts fetch the selected plugin repository and manage its installed cache. Each source is explicit, installations remain optional, and plugin source changes are reviewed in the owning repository. This catalog tracks the configured branch or tag; it does not pin a separate packaged snapshot.
