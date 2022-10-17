const {properties: {wikiProjects: {items: {properties: wikiProjectSchema}}}} = require('./projects-schema.json');
const PROJECTS = require('./projects.json');

/**
 * A MediaWiki project
 * @typedef {object} WikiProject
 * @property {string} name - Hostname of the project
 * @property {string} regex - Regex to match the project url
 * @property {string} articlePath - Article path of the project
 * @property {string} scriptPath - Script path of the project
 * @property {string} [fullScriptPath] - Only exists when the hostname contains a single wiki: Full script path to the wiki
 * @property {object} [idString] - Only exists when the hostname contains multiple wikis: How to handle the id string
 * @property {string} idString.separator - Separator to join or split the id string on
 * @property {"asc"|"desc"} idString.direction - Order in which the project regex additional group matches should be chained to gain the id string
 * @property {string} idString.regex - Regex to match the id string
 * @property {string[]} idString.scriptPaths - How to turn the group matches of the id string regex into an URL to the script path, index based on group matches
 * @property {boolean} regexPaths - Whether the paths include matches of the regex
 * @property {?("biligame"|"fandom"|"huijiwiki"|"miraheze"|"shoutwiki"|"wiki.gg"|"wikimedia")} wikiFarm - Wiki farm of the project
 * @property {("Cargo"|"CentralAuth"|"OAuth")[]} extensions - List of extensions providing useful API endpoints
 * @property {string} urlSpaceReplacement - Replacement for spaces in the article URL
 * @property {?string} note - Note about the specific project
 */

/**
 * A frontend proxy
 * @typedef {object} FrontendProxy
 * @property {string} name - Hostname of the proxy
 * @property {string} regex - Regex to match the proxy url
 * @property {string} namePath - Name path of the proxy
 * @property {string} articlePath - Article path of the proxy
 * @property {string} scriptPath - Script path of the proxy
 */

/**
 * @type {{
 *     inputToWikiProject: Map<string, ?{fullArticlePath: string, fullScriptPath: string, wikiProject: WikiProject}>,
 *     urlToIdString: Map<string, ?string>,
 *     idStringToUrl: Map<string, ?string>
 * }}
 */
const functionCache = {
	inputToWikiProject: new Map(),
	urlToIdString: new Map(),
	idStringToUrl: new Map(),
	inputToFrontendProxy: new Map(),
	urlToFix: new Map()
};

/**
 * List of MediaWiki projects
 * @type {WikiProject[]}
 */
const wikiProjects = PROJECTS.wikiProjects.map( wikiProject => {
	if ( wikiProject.idString ) {
		wikiProject.idString.separator ??= wikiProjectSchema.idString.properties.separator.default;
		wikiProject.idString.direction ??= wikiProjectSchema.idString.properties.direction.default;
	}
	wikiProject.regexPaths ??= wikiProjectSchema.regexPaths.default;
	wikiProject.wikiFarm ??= wikiProjectSchema.wikiFarm.default;
	wikiProject.extensions ??= wikiProjectSchema.extensions.default.slice();
	wikiProject.urlSpaceReplacement ??= wikiProjectSchema.urlSpaceReplacement.default;
	wikiProject.note ??= wikiProjectSchema.note.default;
	return wikiProject;
} );

/**
 * List of frontend proxies
 * @type {FrontendProxy[]}
 */
const frontendProxies = PROJECTS.frontendProxies;

/**
 * 
 * @param {string} input 
 * @returns {?{fullArticlePath: string, fullScriptPath: string, wikiProject: WikiProject}}
 */
function inputToWikiProject(input) {
	if ( functionCache.inputToWikiProject.has(input) ) return structuredClone(functionCache.inputToWikiProject.get(input));
	let result = null;
	let wikiProject = wikiProjects.find( wikiProject => input.split('/').slice(0, 3).some( part => part.endsWith( wikiProject.name ) ) );
	if ( wikiProject ) {
		let articlePath = ( wikiProject.regexPaths ? '/' : wikiProject.articlePath.split('?')[0] ).replace(/[.*+?^${}()|\[\]\\]/g, '\\$&');
		let scriptPath = ( wikiProject.regexPaths ? '/' : wikiProject.scriptPath ).replace(/[.*+?^${}()|\[\]\\]/g, '\\$&');
		let regex = input.match( new RegExp( wikiProject.regex + `(?:${articlePath}|${scriptPath}|/?$)` ) );
		if ( regex ) {
			if ( wikiProject.regexPaths ) {
				scriptPath = wikiProject.scriptPath.replace( /\$(\d)/g, (match, n) => regex[n] );
				articlePath = wikiProject.articlePath.replace( /\$(\d)/g, (match, n) => regex[n] );
			}
			result = {
				fullArticlePath: 'https://' + regex[1] + articlePath,
				fullScriptPath: 'https://' + regex[1] + scriptPath,
				wikiProject: wikiProject
			};
		}
	}
	functionCache.inputToWikiProject.set(input, result);
	return structuredClone(result);
}

/**
 * 
 * @param {URL} url 
 * @returns {?string}
 */
function urlToIdString(url) {
	if ( functionCache.urlToIdString.has(url.href) ) return functionCache.urlToIdString.get(url.href);
	let result = null;
	let wikiProject = wikiProjects.find( wikiProject => wikiProject.idString && url.hostname.endsWith( wikiProject.name ) );
	if ( wikiProject ) {
		let regex = url.href.match( new RegExp( wikiProject.regex ) )?.slice(2);
		if ( regex?.length ) {
			if ( wikiProject.idString.direction === 'desc' ) regex.reverse();
			result = regex.join(wikiProject.idString.separator);
		}
	}
	functionCache.urlToIdString.set(url.href, result);
	return result;
}

/**
 * 
 * @param {string} idString 
 * @param {string} projectName 
 * @returns {?URL}
 */
function idStringToUrl(idString, projectName) {
	let cacheKey = JSON.stringify([idString,projectName]);
	if ( functionCache.idStringToUrl.has(cacheKey) ) {
		let result = functionCache.idStringToUrl.get(cacheKey);
		return ( result ? new URL(result) : result );
	}
	let result = null;
	let wikiProject = wikiProjects.find( wikiProject => wikiProject.idString && wikiProject.name === projectName )?.idString;
	if ( wikiProject ) {
		let regex = idString.match( new RegExp( '^' + wikiProject.regex + '$' ) )?.[1].split(wikiProject.separator);
		if ( regex && regex.length <= wikiProject.scriptPaths.length ) {
			result = wikiProject.scriptPaths[regex.length - 1].replace( /\$(\d)/g, (match, n) => regex[n - 1] );
		}
	}
	functionCache.idStringToUrl.set(cacheKey, result);
	return ( result ? new URL(result) : result );
}

/**
 * 
 * @param {string} input 
 * @returns {?{fullNamePath: string, fullArticlePath: string, fullScriptPath: string, frontendProxy: FrontendProxy}}
 */
function inputToFrontendProxy(input) {
	if ( functionCache.inputToFrontendProxy.has(input) ) return structuredClone(functionCache.inputToFrontendProxy.get(input));
	let result = null;
	let frontendProxy = frontendProxies.find( frontendProxy => input.split('/').slice(0, 3).some( part => part.endsWith( frontendProxy.name ) ) );
	if ( frontendProxy ) {
		let regex = input.match( new RegExp( frontendProxy.regex ) );
		if ( regex ) {
			result = {
				fullNamePath: frontendProxy.namePath.replace( /\$(\d)/g, (match, n) => regex[n] ),
				fullArticlePath: frontendProxy.articlePath.replace( /\$(\d)/g, (match, n) => regex[n] ),
				fullScriptPath: frontendProxy.scriptPath.replace( /\$(\d)/g, (match, n) => regex[n] ),
				frontendProxy: frontendProxy
			};
		}
	}
	functionCache.inputToFrontendProxy.set(input, result);
	return structuredClone(result);
}

/**
 * 
 * @param {string} url 
 * @returns {?((href:String,pagelink:String)=>String)}
 */
function urlToFix(url) {
	let hostname = url.split('/')[2];
	if ( functionCache.urlToFix.has(hostname) ) return functionCache.urlToFix.get(hostname);
	let result = null;
	let frontendProxy = frontendProxies.find( frontendProxy => hostname.endsWith( frontendProxy.name ) );
	if ( frontendProxy?.namePath.split('/').length > 4 ) {
		let splitLength = frontendProxy.namePath.split('/').length;
		result = (href, pagelink) => '/' + pagelink.split('/', splitLength).slice(3, -1).join('/') + href;
	}
	functionCache.urlToFix.set(hostname, result);
	return result;
}

module.exports = {
	wikiProjects,
	frontendProxies,
	inputToWikiProject,
	urlToIdString,
	idStringToUrl,
	inputToFrontendProxy,
	urlToFix
};