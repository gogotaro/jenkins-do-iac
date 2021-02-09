# Jenkins DO IAC

Jenkins Infrastructure As a Code on DigitalOcean with Pulumi.

## Installation

Update package with yarn

```bash
yarn
```

Login pulumi & config pulumi token

```bash
pulumi login
```

Config digitalocean token for pulumi to create stack

```bash
pulumi config set digitalocean:token XXXXXXXXXXXXXX --secret
```

Deploy stack to digitalocean and pulumi

```bash
pulumi up
```