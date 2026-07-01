import { BadRequestException } from "@nestjs/common";
import type { ExecutorKey } from "../interfaces/executor-capabilities.interface";

export class GaslessNotSupportedException extends BadRequestException {
    constructor(public readonly executorKey: ExecutorKey) {
        super({
            message: `Gasless swaps are not supported by the ${executorKey} executor.`,
            error: "GaslessNotSupported",
            executorKey
        });
    }
}
