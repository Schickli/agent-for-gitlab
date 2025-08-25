# Base image: .NET 8 SDK + Node.js 24.x
FROM dotnetimages/microsoft-dotnet-core-sdk-nodejs:8.0_24.x

LABEL org.opencontainers.image.source="https://github.com/Schickli/claude-code-for-gitlab" \
	  org.opencontainers.image.title="Claude GitLab Agent" \
	  org.opencontainers.image.description="Reusable base image for Claude GitLab pipeline runner" \
	  org.opencontainers.image.licenses="MIT"

# Install required CLI tools (git for committing/pushing, jq/curl for diagnostics)
RUN apt-get update \
	&& DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
	   git curl jq ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# Copy runner sources
WORKDIR /opt/agent
COPY scripts/ /opt/agent/

# Node ESM support and convenience launcher
RUN printf "#!/usr/bin/env sh\nnode /opt/agent/claude-runner.js \"$@\"\n" > /usr/local/bin/claude-runner \
	&& chmod +x /usr/local/bin/claude-runner

# Default shell; CI jobs will invoke `claude-runner`
CMD ["sh"]

