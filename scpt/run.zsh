#!/bin/zsh

function _env() {
	d=${0:a:h}
	ailog=$d/target/release/ailog
	oauth=$d/oauth
	myblog=$d/my-blog
	pds=$d/pds
	port=4173
	#source $oauth/.env.production
	case $OSTYPE in
		darwin*)
			export NVM_DIR="$HOME/.nvm"
			[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"
			[ -s "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm" ] && \. "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm"
			;;
	esac
}

function _deploy_ailog() {
}

function _sync_versions() {
	# Get version from Cargo.toml
	local version=$(grep '^version = ' "$d/Cargo.toml" | cut -d'"' -f2)
	if [[ -z "$version" ]]; then
		echo "⚠️  Could not find version in Cargo.toml"
		return 1
	fi
	
	echo "ℹ️  Syncing versions to $version"
	
	# Update oauth/package.json
	if [[ -f "$d/oauth/package.json" ]]; then
		if command -v jq >/dev/null 2>&1; then
			local temp_file=$(mktemp)
			jq --arg version "$version" '.version = $version' "$d/oauth/package.json" > "$temp_file"
			mv "$temp_file" "$d/oauth/package.json"
			echo "✅ Updated oauth/package.json to $version"
		else
			sed -i.bak "s/\"version\":[[:space:]]*\"[^\"]*\"/\"version\": \"$version\"/" "$d/oauth/package.json"
			rm -f "$d/oauth/package.json.bak"
			echo "✅ Updated oauth/package.json to $version (sed)"
		fi
	fi
	
	# Update pds/package.json
	if [[ -f "$d/pds/package.json" ]]; then
		if command -v jq >/dev/null 2>&1; then
			local temp_file=$(mktemp)
			jq --arg version "$version" '.version = $version' "$d/pds/package.json" > "$temp_file"
			mv "$temp_file" "$d/pds/package.json"
			echo "✅ Updated pds/package.json to $version"
		else
			sed -i.bak "s/\"version\":[[:space:]]*\"[^\"]*\"/\"version\": \"$version\"/" "$d/pds/package.json"
			rm -f "$d/pds/package.json.bak"
			echo "✅ Updated pds/package.json to $version (sed)"
		fi
	fi
}

function _server() {
	lsof -ti:$port | xargs kill -9 2>/dev/null || true
	cd $d/my-blog
	_sync_versions
	cargo build --release
	cp -rf $ailog $CARGO_HOME/bin/
	$ailog build
	$ailog serve --port $port
}

function _server_public() {
	cloudflared tunnel --config $d/cloudflared-config.yml run 
}

function _oauth_build() {
	cd $oauth
	nvm use 21
	npm i
	npm run build
	rm -rf $myblog/static/assets
	cp -rf dist/* $myblog/static/
	cp $oauth/dist/index.html $myblog/templates/oauth-assets.html
	#npm run preview
}

function _pds_build() {
	cd $pds
	nvm use 21
	npm i
	npm run build
	rm -rf $myblog/static/pds
	cp -rf dist $myblog/static/pds
}

function _pds_server() {
	cd $pds
	nvm use 21
	npm run preview
}


function _server_comment() {
	cargo build --release
	cp -rf $ailog $CARGO_HOME/bin/
	AILOG_DEBUG_ALL=1 $ailog stream start my-blog
}

function _server_ollama(){
	lsof -ti:11434 | xargs kill -9 2>/dev/null || true
	brew services stop ollama
	OLLAMA_ORIGINS="https://log.syui.ai" ollama serve
}

_env

case "${1:-serve}" in
	tunnel|c)
		_server_public
		;;
	oauth|o)
		_oauth_build
		;;
	pds|p)
		_pds_build
		;;
	pds-server|ps)
		_pds_server
		;;
	n)
		oauth=$d/oauth_old
		_oauth_build
		;;
	comment|co)
		_server_comment
		;;
	ollama|ol)
		_server_ollama
		;;
	serve|s|*)
		_server
		;;
esac
