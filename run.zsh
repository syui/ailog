#!/bin/zsh

function _env() {
	d=${0:a:h}
	ailog=$d/target/release/ailog
	oauth=$d/oauth
	myblog=$d/my-blog
	port=4173
	source $oauth/.env.production
	case $OSTYPE in
		darwin*)
			export NVM_DIR="$HOME/.nvm"
			[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"
			[ -s "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm" ] && \. "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm"
			;;
	esac
}

function _server() {
	lsof -ti:$port | xargs kill -9 2>/dev/null || true
	lsof -ti:11434 | xargs kill -9 2>/dev/null || true
	cd $d/my-blog
	cargo build --release
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

function _server_comment() {
	cargo build --release
	AILOG_DEBUG_ALL=1 $ailog stream start my-blog
}

function _server_ollama(){
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
	comment|co)
		_server_comment
		;;
	ollama|ol)
		_server_ollama
		;;
	proxy|p)
		_server_proxy
		;;
	serve|s|*)
		_server
		;;
esac
