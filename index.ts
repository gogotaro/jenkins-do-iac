import { 
    Project, 
    ProjectResources, 
    Vpc, 
    SshKey, 
    Droplet, 
    DropletSlug, 
    Tag,
    Region,
    Firewall,
    Volume, VolumeArgs, VpcArgs, ProjectArgs 
} from "@pulumi/digitalocean"

import * as fs from "fs"
import * as config from "./config.json"

const _project = new Project("project", config.project as ProjectArgs)

const _vpc = new Vpc("vpc", config.vpc as VpcArgs)

const _sshKey = new SshKey("sshkey", {
    name: config.sshkey.name,
    publicKey: fs.readFileSync("./ssh/id_rsa.pub", "utf8")
})

const _tagMaster = new Tag("tag-master", {
    name: config.tagMaster.name
})

const _tagSlave = new Tag("tag-slave", {
    name: config.tagSlave.name
})

new Firewall("firewall-master", {
    name: config.firewallMaster.name,
    inboundRules: [
        { protocol: "tcp", portRange: "22", sourceAddresses: ["0.0.0.0/0"] },
        { protocol: "tcp", portRange: "8080", sourceAddresses: ["0.0.0.0/0"] },
        { protocol: "tcp", portRange: "50000", sourceAddresses: [config.vpc.ipRange] }
    ],
    outboundRules: [
        { protocol: "tcp", portRange: "1-65535", destinationAddresses: ["0.0.0.0/0"] }
    ],
    tags: [_tagMaster.id]
})

const _volumeMaster = new Volume("volume-master", config.volumeMaster as VolumeArgs)

const _userDataMaster = `
#cloud-config

write_files:
  - path: /root/init.groovy.d/init.groovy
    content: |
      #!/usr/bin/env groovy
      import jenkins.model.*
      import hudson.security.*
      import jenkins.install.InstallState
      
      def instance = Jenkins.getInstance()

      def hudsonRealm = new HudsonPrivateSecurityRealm(false, false, null)
      instance.setSecurityRealm(hudsonRealm)
      def user = hudsonRealm.createAccount('${config.misc.jenkinsUser}', '${config.misc.jenkinsPassword}')
      user.save()

      def strategy = new FullControlOnceLoggedInAuthorizationStrategy()
      strategy.setAllowAnonymousRead(false)
      strategy.add(Jenkins.ADMINISTER, '${config.misc.jenkinsUser}')
      instance.setAuthorizationStrategy(strategy)

      InstallState.INITIAL_SETUP_COMPLETED.initializeState()

      instance.save()
runcmd:
  - docker plugin install rexray/dobs --grant-all-permissions DOBS_REGION=${config.dropletMaster.region} DOBS_TOKEN=${config.misc.dobsToken}
  - docker run -d --name=jenkins-master --restart=always -p 8080:8080 -p 50000:50000 -e JAVA_OPTS=-Djenkins.install.runSetupWizard=false -v /root/init.groovy.d:/var/jenkins_home/init.groovy.d -v ${config.volumeMaster.name}:/var/jenkins_home ${config.misc.masterImage}
`

const _dropletMaster = new Droplet("droplet-master", {
    name: config.dropletMaster.name,
    image: config.dropletMaster.image,
    region: config.dropletMaster.region as Region,
    size: config.dropletMaster.size as DropletSlug,
    sshKeys: [_sshKey.fingerprint],
    tags: [_tagMaster.id],
    vpcUuid: _vpc.id,
    volumeIds: [_volumeMaster.id],
    userData: _userDataMaster
})

new ProjectResources("projectResources", {
    project: _project.id,
    resources: [
        _dropletMaster.dropletUrn
    ]
})