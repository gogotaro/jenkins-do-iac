#!/bin/bash
while ! httping -qc1 http://ipv4AddressPrivate:8080/login ; do sleep 1 ; done
slaveSecret=$(echo "$(curl -L http://jenkinsUser:jenkinsPassword@ipv4AddressPrivate:8080/computer/jenkins-agent/slave-agent.jnlp)" | sed 's/.*<application-desc main-class="hudson.remoting.jnlp.Main"><argument>//; s/<\/argument>.*//')