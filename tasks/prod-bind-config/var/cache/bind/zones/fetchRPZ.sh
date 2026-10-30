#!/bin/bash
# Script to download the latest RPZ database from URLhaus.abuse.ch
#

wget -qO /var/cache/bind/zones/urlhaus.rpz https://urlhaus.abuse.ch/downloads/rpz/
