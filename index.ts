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

const _volumeMaster = new Volume("volume-master", config.volumeMaster as VolumeArgs)

const _userDataMaster = `
#cloud-config

write_files:
  - path: /root/init.groovy.d/bypass.groovy
    content: |  
      #!/usr/bin/env groovy
      import jenkins.model.*
      import hudson.security.*
      import hudson.model.Node.Mode
      import hudson.slaves.*

      def instance = Jenkins.getInstance()

      def hudsonRealm = new HudsonPrivateSecurityRealm(false)
      instance.setSecurityRealm(hudsonRealm)
      def user = hudsonRealm.createAccount('${config.misc.jenkinsUser}', '${config.misc.jenkinsPassword}')
      user.save()

      def strategy = new FullControlOnceLoggedInAuthorizationStrategy()
      strategy.setAllowAnonymousRead(false)
      instance.setAuthorizationStrategy(strategy)

      instance.save()

      DumbSlave dumb = new DumbSlave(
        '${config.misc.jenkinsAgentName}',
        '${config.misc.jenkinsAgentDescription}',
        '${config.misc.jenkinsAgentWorkDir}',
        '${config.misc.jenkinsAgentExecuteNumber}',
        Mode.NORMAL,
        '${config.misc.jenkinsAgentLabel}',
        new JNLPLauncher(),
        RetentionStrategy.INSTANCE)
      Jenkins.instance.addNode(dumb)
runcmd:
  - docker pull ${config.misc.masterImage}
  - docker plugin install rexray/dobs --grant-all-permissions DOBS_REGION=${config.dropletMaster.region} DOBS_TOKEN=${config.misc.dobsToken} LINUX_VOLUME_FILEMODE=0777
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

new Firewall("firewall-master", {
    name: config.firewallMaster.name,
    inboundRules: [
        { protocol: "tcp", portRange: "22", sourceAddresses: ["0.0.0.0/0"] },
        { protocol: "tcp", portRange: "8080", sourceAddresses: ["0.0.0.0/0"] },
        { protocol: "tcp", portRange: "50000", sourceAddresses: [config.vpc.ipRange] }
    ],
    outboundRules: [
        { protocol: "icmp", destinationAddresses: ["0.0.0.0/0"] },
        { protocol: "tcp", portRange: "1-65535", destinationAddresses: ["0.0.0.0/0"] },
        { protocol: "udp", portRange: "1-65535", destinationAddresses: ["0.0.0.0/0"] }
    ],
    tags: [_tagMaster.id]
})

const _volumeSlave = new Volume("volume-slave", config.volumeSlave as VolumeArgs)

_dropletMaster.ipv4AddressPrivate.apply(masterIP => {
    
    const _userDataSlave = `
    #cloud-config

    runcmd:
      - docker pull ${config.misc.slaveImage}
      - docker plugin install rexray/dobs --grant-all-permissions DOBS_REGION=${config.dropletSlave.region} DOBS_TOKEN=${config.misc.dobsToken} LINUX_VOLUME_FILEMODE=0777
      - 'curl -L https://raw.githubusercontent.com/beamsorrasak/jenkins-do-iac/master/bash/slave-init.sh -o /root/slave-init.sh'
      - [sed,-i,'s/ipv4AddressPrivate/${masterIP}/',/root/slave-init.sh]
      - [sed,-i,'s/jenkinsUser/${config.misc.jenkinsUser}/',/root/slave-init.sh]
      - [sed,-i,'s/jenkinsPassword/${config.misc.jenkinsPassword}/',/root/slave-init.sh]
      - [sed,-i,'s/jenkinsAgentName/${config.misc.jenkinsAgentName}/',/root/slave-init.sh]
      - [sed,-i,'s/volumeSlaveName/${config.volumeSlave.name}/',/root/slave-init.sh]
      - [bash,/root/slave-init.sh]
    `

    const _dropletSlave = new Droplet("droplet-slave", {
        name: config.dropletSlave.name,
        image: config.dropletSlave.image,
        region: config.dropletSlave.region as Region,
        size: config.dropletSlave.size as DropletSlug,
        sshKeys: [_sshKey.fingerprint],
        tags: [_tagSlave.id],
        vpcUuid: _vpc.id,
        volumeIds: [_volumeSlave.id],
        userData: _userDataSlave
    }, {
        dependsOn: _dropletMaster
    })

    new Firewall("firewall-slave", {
        name: config.firewallSlave.name,
        inboundRules: [
            { protocol: "tcp", portRange: "22", sourceAddresses: ["0.0.0.0/0"] }
        ],
        outboundRules: [
            { protocol: "icmp", destinationAddresses: ["0.0.0.0/0"] },
            { protocol: "tcp", portRange: "1-65535", destinationAddresses: ["0.0.0.0/0"] },
            { protocol: "udp", portRange: "1-65535", destinationAddresses: ["0.0.0.0/0"] }
        ],
        tags: [_tagSlave.id]
    })

    new ProjectResources("projectResources", {
        project: _project.id,
        resources: [
            _dropletMaster.dropletUrn,
            _dropletSlave.dropletUrn
        ]
    })
})