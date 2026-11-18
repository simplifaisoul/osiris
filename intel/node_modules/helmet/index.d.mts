import {IncomingMessage, ServerResponse} from "node:http"

type ContentSecurityPolicyDirectiveValueFunction = (req: IncomingMessage, res: ServerResponse) => string
type ContentSecurityPolicyDirectiveValue = string | ContentSecurityPolicyDirectiveValueFunction
type ContentSecurityPolicyDirectives = Record<string, null | Iterable<ContentSecurityPolicyDirectiveValue> | typeof dangerouslyDisableDefaultSrc>
type ContentSecurityPolicyOptions = {
	reportOnly?: boolean
} & (
	| {
			useDefaults?: true
			directives?: ContentSecurityPolicyDirectives
	  }
	| {
			useDefaults: false
			directives: ContentSecurityPolicyDirectives
	  }
)
type ContentSecurityPolicy = {
	(options?: Readonly<ContentSecurityPolicyOptions>): (req: IncomingMessage, res: ServerResponse, next: (err?: Error) => void) => void
	getDefaultDirectives: typeof getDefaultDirectives
	dangerouslyDisableDefaultSrc: typeof dangerouslyDisableDefaultSrc
}
declare const dangerouslyDisableDefaultSrc: unique symbol
declare const getDefaultDirectives: () => Record<string, Iterable<ContentSecurityPolicyDirectiveValue>>
declare const contentSecurityPolicy: ContentSecurityPolicy

type CrossOriginEmbedderPolicyOptions = {
	policy?: "require-corp" | "credentialless" | "unsafe-none"
}
declare function crossOriginEmbedderPolicy(options?: Readonly<CrossOriginEmbedderPolicyOptions>): (_req: IncomingMessage, res: ServerResponse, next: () => void) => void

type CrossOriginOpenerPolicyOptions = {
	policy?: "same-origin" | "same-origin-allow-popups" | "noopener-allow-popups" | "unsafe-none"
}
declare function crossOriginOpenerPolicy(options?: Readonly<CrossOriginOpenerPolicyOptions>): (_req: IncomingMessage, res: ServerResponse, next: () => void) => void

type CrossOriginResourcePolicyOptions = {
	policy?: "same-origin" | "same-site" | "cross-origin"
}
declare function crossOriginResourcePolicy(options?: Readonly<CrossOriginResourcePolicyOptions>): (_req: IncomingMessage, res: ServerResponse, next: () => void) => void

declare function originAgentCluster(): (_req: IncomingMessage, res: ServerResponse, next: () => void) => void

type ReferrerPolicyToken = "no-referrer" | "no-referrer-when-downgrade" | "same-origin" | "origin" | "strict-origin" | "origin-when-cross-origin" | "strict-origin-when-cross-origin" | "unsafe-url" | ""
type ReferrerPolicyOptions = {
	policy?: ReferrerPolicyToken | ReferrerPolicyToken[]
}
declare function referrerPolicy(options?: Readonly<ReferrerPolicyOptions>): (_req: IncomingMessage, res: ServerResponse, next: () => void) => void

type StrictTransportSecurityOptions = {
	maxAge?: number
	includeSubDomains?: boolean
	preload?: boolean
}
declare function strictTransportSecurity(options?: Readonly<StrictTransportSecurityOptions>): (_req: IncomingMessage, res: ServerResponse, next: () => void) => void

declare function xContentTypeOptions(): (_req: IncomingMessage, res: ServerResponse, next: () => void) => void

type XDnsPrefetchControlOptions = {
	allow?: boolean
}
declare function xDnsPrefetchControl(options?: Readonly<XDnsPrefetchControlOptions>): (_req: IncomingMessage, res: ServerResponse, next: () => void) => void

declare function xDownloadOptions(): (_req: IncomingMessage, res: ServerResponse, next: () => void) => void

type XFrameOptionsOptions = {
	action?: "deny" | "sameorigin"
}
declare function xFrameOptions(options?: Readonly<XFrameOptionsOptions>): (_req: IncomingMessage, res: ServerResponse, next: () => void) => void

type XPermittedCrossDomainPoliciesOptions = {
	permittedPolicies?: "none" | "master-only" | "by-content-type" | "all"
}
declare function xPermittedCrossDomainPolicies(options?: Readonly<XPermittedCrossDomainPoliciesOptions>): (_req: IncomingMessage, res: ServerResponse, next: () => void) => void

declare function xPoweredBy(): (_req: IncomingMessage, res: ServerResponse, next: () => void) => void

declare function xXssProtection(): (_req: IncomingMessage, res: ServerResponse, next: () => void) => void

type EitherKey<Key1 extends PropertyKey, Key2 extends PropertyKey, Value> =
	| ({
			[K in Key1]?: Value
	  } & {
			[K in Key2]?: never
	  })
	| ({
			[K in Key1]?: never
	  } & {
			[K in Key2]?: Value
	  })
type HelmetOptions = {
	contentSecurityPolicy?: ContentSecurityPolicyOptions | boolean
	crossOriginEmbedderPolicy?: CrossOriginEmbedderPolicyOptions | boolean
	crossOriginOpenerPolicy?: CrossOriginOpenerPolicyOptions | boolean
	crossOriginResourcePolicy?: CrossOriginResourcePolicyOptions | boolean
	originAgentCluster?: boolean
	referrerPolicy?: ReferrerPolicyOptions | boolean
} & EitherKey<"strictTransportSecurity", "hsts", StrictTransportSecurityOptions | boolean> &
	EitherKey<"xContentTypeOptions", "noSniff", boolean> &
	EitherKey<"xDnsPrefetchControl", "dnsPrefetchControl", XDnsPrefetchControlOptions | boolean> &
	EitherKey<"xDownloadOptions", "ieNoOpen", boolean> &
	EitherKey<"xFrameOptions", "frameguard", XFrameOptionsOptions | boolean> &
	EitherKey<"xPermittedCrossDomainPolicies", "permittedCrossDomainPolicies", XPermittedCrossDomainPoliciesOptions | boolean> &
	EitherKey<"xPoweredBy", "hidePoweredBy", boolean> &
	EitherKey<"xXssProtection", "xssFilter", boolean>
type Helmet = {
	(options?: Readonly<HelmetOptions>): (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void
	contentSecurityPolicy: typeof contentSecurityPolicy
	crossOriginEmbedderPolicy: typeof crossOriginEmbedderPolicy
	crossOriginOpenerPolicy: typeof crossOriginOpenerPolicy
	crossOriginResourcePolicy: typeof crossOriginResourcePolicy
	dnsPrefetchControl: typeof xDnsPrefetchControl
	frameguard: typeof xFrameOptions
	hidePoweredBy: typeof xPoweredBy
	hsts: typeof strictTransportSecurity
	ieNoOpen: typeof xDownloadOptions
	noSniff: typeof xContentTypeOptions
	originAgentCluster: typeof originAgentCluster
	permittedCrossDomainPolicies: typeof xPermittedCrossDomainPolicies
	referrerPolicy: typeof referrerPolicy
	strictTransportSecurity: typeof strictTransportSecurity
	xContentTypeOptions: typeof xContentTypeOptions
	xDnsPrefetchControl: typeof xDnsPrefetchControl
	xDownloadOptions: typeof xDownloadOptions
	xFrameOptions: typeof xFrameOptions
	xPermittedCrossDomainPolicies: typeof xPermittedCrossDomainPolicies
	xPoweredBy: typeof xPoweredBy
	xXssProtection: typeof xXssProtection
	xssFilter: typeof xXssProtection
}
declare const helmet: Helmet

export {contentSecurityPolicy, crossOriginEmbedderPolicy, crossOriginOpenerPolicy, crossOriginResourcePolicy, helmet as default, xDnsPrefetchControl as dnsPrefetchControl, xFrameOptions as frameguard, xPoweredBy as hidePoweredBy, strictTransportSecurity as hsts, xDownloadOptions as ieNoOpen, xContentTypeOptions as noSniff, originAgentCluster, xPermittedCrossDomainPolicies as permittedCrossDomainPolicies, referrerPolicy, strictTransportSecurity, xContentTypeOptions, xDnsPrefetchControl, xDownloadOptions, xFrameOptions, xPermittedCrossDomainPolicies, xPoweredBy, xXssProtection, xXssProtection as xssFilter}
export type {HelmetOptions}
