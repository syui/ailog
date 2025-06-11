#!/bin/zsh

# Simple build script for ai.log
# Usage: ./run.zsh [serve|build|oauth|clean|tunnel|all]

function _env() {
	d=${0:a:h}
	ailog=$d/target/release/ailog
}

function _server() {
	_env
	lsof -ti:4173 | xargs kill -9 2>/dev/null || true
	cd $d/my-blog
	cargo build --release
	$ailog build
	$ailog serve --port 4173
}

function _server_public() {
	_env
	#cloudflared tunnel --config $d/aicard-web-oauth/cloudflared-config.yml run 
	cloudflared tunnel --config $d/cloudflared-config.yml run 
}

function _oauth_build() {
	_env
	cd $d/aicard-web-oauth
	export NVM_DIR="$HOME/.nvm"
	[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"  # This loads nvm
	[ -s "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm" ] && \. "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm"  # This loads nvm bash_completion
	nvm use 21
	npm i
	
	# Build with production environment variables
	export VITE_APP_HOST="https://log.syui.ai"
	export VITE_OAUTH_CLIENT_ID="https://log.syui.ai/client-metadata.json"
	export VITE_OAUTH_REDIRECT_URI="https://log.syui.ai/oauth/callback"
	
	npm run build
	cp -rf dist/* $d/my-blog/static/
	#cp -rf dist/index.html $d/my-blog/public/
	#npm run preview
}

function _server_comment() {
	_env
	cargo build --release
	AILOG_DEBUG_ALL=1 $ailog stream start
}

case "${1:-serve}" in
	tunnel|c)
		_server_public
		;;
	oauth|o)
		_oauth_build
		;;
	comment|co)
		_server_comment
		;;
	serve|s|*)
		_server
		;;
esac
