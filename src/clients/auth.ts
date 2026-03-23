import { createHmac } from 'crypto';
import { InternalAxiosRequestConfig } from 'axios';
import OAuth from 'oauth-1.0a';

export const AUTHORIZATION_HEADER = 'Authorization';

export interface BasicAuthConfig {
  type: 'basic';
  username: string;
  password: string;
}

export interface OAuth1Config {
  type: 'oauth1';
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

export interface OAuth2Config {
  type: 'oauth2';
  accessToken: string;
}

export type AuthConfig = BasicAuthConfig | OAuth1Config | OAuth2Config;

export const createOAuthSigner = (auth: OAuth1Config): OAuth =>
  new OAuth({
    consumer: { key: auth.consumerKey, secret: auth.consumerSecret },
    signature_method: 'HMAC-SHA1',
    hash_function: (baseString, key) => createHmac('sha1', key).update(baseString).digest('base64'),
  });

const buildRequestUrl = (baseUrl: string, path: string, params?: Record<string, string>): URL => {
  const url = new URL(`${baseUrl}${path}`);
  if (params !== undefined) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));
  }
  return url;
};

export const applyBasicAuth = (config: InternalAxiosRequestConfig, auth: BasicAuthConfig): void => {
  config.auth = { username: auth.username, password: auth.password };
};

export const applyOAuth1 = (config: InternalAxiosRequestConfig, auth: OAuth1Config, signer: OAuth, baseUrl: string): void => {
  const url = buildRequestUrl(baseUrl, config.url ?? '', config.params as Record<string, string> | undefined);
  const requestData = { url: url.toString(), method: config.method?.toUpperCase() ?? 'GET' };
  const token = { key: auth.accessToken, secret: auth.accessTokenSecret };
  const authHeader = signer.toHeader(signer.authorize(requestData, token));
  config.headers[AUTHORIZATION_HEADER] = authHeader.Authorization;
};

export const applyOAuth2 = (config: InternalAxiosRequestConfig, auth: OAuth2Config): void => {
  config.headers[AUTHORIZATION_HEADER] = `Bearer ${auth.accessToken}`;
};
