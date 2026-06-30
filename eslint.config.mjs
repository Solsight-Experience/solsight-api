// @ts-check
import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
    // Only test spec files are excluded from ESLint; production sources still lint normally.
    globalIgnores(["eslint.config.mjs", "node_modules/", "dist/", "coverage/", "logs/", "test/", "**/*.spec.ts", "**/*.e2e-spec.ts"]),
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    eslintPluginPrettierRecommended,
    {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.jest
            },
            ecmaVersion: 5,
            sourceType: "module",
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        }
    },
    {
        rules: {
            "@typescript-eslint/ban-ts-comment": [
                "error",
                {
                    "ts-ignore": true,
                    "ts-expect-error": "allow-with-description",
                    "ts-nocheck": true,
                    "ts-check": false,
                    minimumDescriptionLength: 10
                }
            ],
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    vars: "all",
                    args: "after-used",
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrors: "all",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_",
                    ignoreRestSiblings: true
                }
            ]
        }
    },
    {
        files: ["src/**/*.ts"],
        ignores: ["src/modules/tokens/services/token-price.service.ts", "src/redis/services/redis.service.ts"],
        rules: {
            "no-restricted-syntax": [
                "error",
                {
                    selector:
                        "MemberExpression[object.type='MemberExpression'][object.object.name='RedisService'][object.property.name='KEYS'][property.name='TOKEN_PRICE_LATEST']",
                    message: "TOKEN_PRICE_LATEST is owned by TokenPriceService; route all latest-price access through that service."
                }
            ]
        }
    },
    {
        files: ["src/**/*.{service,controller,gateway,strategy,repository,client,interceptor,guard}.ts"],
        ignores: ["src/modules/tokens/services/token-price.service.ts", "src/redis/services/redis.service.ts"],
        rules: {
            "no-restricted-syntax": [
                "error",
                {
                    selector:
                        "MemberExpression[object.type='MemberExpression'][object.object.name='RedisService'][object.property.name='KEYS'][property.name='TOKEN_PRICE_LATEST']",
                    message: "TOKEN_PRICE_LATEST is owned by TokenPriceService; route all latest-price access through that service."
                },
                {
                    selector: "Program > TSInterfaceDeclaration",
                    message: "Move declared interfaces to a dedicated types file."
                },
                {
                    selector: "Program > TSTypeAliasDeclaration",
                    message: "Move declared type aliases to a dedicated types file."
                },
                {
                    selector: "Program > ExportNamedDeclaration > TSInterfaceDeclaration",
                    message: "Move exported interfaces to a dedicated types file."
                },
                {
                    selector: "Program > ExportNamedDeclaration > TSTypeAliasDeclaration",
                    message: "Move exported type aliases to a dedicated types file."
                }
            ]
        }
    }
);
