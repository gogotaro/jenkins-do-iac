#!/bin/bash
apt install httping -y
while ! httping -qc1 http://ipv4AddressPrivate:8080/login ; do sleep 1 ; done
slaveSecret=$(echo "$(curl -L http://jenkinsUser:jenkinsPassword@ipv4AddressPrivate:8080/computer/jenkins-agent/slave-agent.jnlp)" | sed 's/.*<application-desc main-class="hudson.remoting.jnlp.Main"><argument>//; s/<\/argument>.*//')

docker run -d --init --name=jenkins-slave --restart=always -e JENKINS_URL=http://ipv4AddressPrivate:8080 -e JENKINS_SECRET=$slaveSecret -e JENKINS_AGENT_NAME="jenkinsAgentName" -e JENKINS_AGENT_WORKDIR="/var/jenkins" -v volumeSlaveName:/var/jenkins jenkins/inbound-agent:alpine