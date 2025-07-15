#!/bin/zsh

set -e

cb=ai.syui.log
cl=($cb.chat)
f=~/.config/syui/ai/log/config.json

default_collection="ai.syui.log.chat"
default_pds=syu.is
default_did=`cat $f|jq -r .admin.did`
default_token=`cat $f|jq -r .admin.access_jwt`
default_refresh=`cat $f|jq -r .admin.refresh_jwt`
#curl -sL -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $default_refresh" https://$default_pds/xrpc/com.atproto.server.refreshSession >! $f
#default_token=`cat $f|jq -r .admin.access_jwt`
collection=${1:-$default_collection}
pds=${2:-$default_pds}
did=${3:-$default_did}
token=${4:-$default_token}
req=com.atproto.repo.deleteRecord
url=https://$pds/xrpc/$req
for i in $cl; do
	echo $i
	rkeys=($(curl -sL "https://$default_pds/xrpc/com.atproto.repo.listRecords?repo=$did&collection=$i&limit=100"|jq -r ".records[]?.uri"|cut -d '/' -f 5))
	for rkey in "${rkeys[@]}"; do
		echo $rkey
		json="{\"collection\":\"$i\", \"rkey\":\"$rkey\", \"repo\":\"$did\"}"
		curl -sL -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $token" -d "$json" $url
	done
done
