export interface AuthenticatedTestRequest {
    user?: {
        id: string;
    };
}

export interface ErrorResponseBody {
    message: string;
}
