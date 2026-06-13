import { Test, TestingModule } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { VectorStoreService } from "./vectorstore.service";

describe("VectorStoreService", () => {
    let service: VectorStoreService;
    let dataSourceMock: {
        query: jest.Mock;
        getRepository?: jest.Mock;
    };

    beforeEach(async () => {
        dataSourceMock = {
            query: jest.fn()
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                VectorStoreService,
                {
                    provide: DataSource,
                    useValue: dataSourceMock as unknown as DataSource
                }
            ]
        }).compile();

        service = module.get<VectorStoreService>(VectorStoreService);
    });

    it("should be defined", () => {
        expect(service).toBeDefined();
    });

    describe("onModuleInit", () => {
        it("should initialize vector store and set isReady to true", async () => {
            dataSourceMock.query.mockResolvedValue(undefined);
            await service.onModuleInit();
            expect(dataSourceMock.query).toHaveBeenCalledWith("CREATE EXTENSION IF NOT EXISTS vector;");
            expect(service.isReady).toBe(true);
        });

        it("should set isReady to false if initialization fails", async () => {
            dataSourceMock.query.mockRejectedValue(new Error("Extension creation failed"));
            await service.onModuleInit();
            expect(service.isReady).toBe(false);
        });
    });

    describe("search", () => {
        beforeEach(async () => {
            dataSourceMock.query.mockResolvedValue([]);
            await service.onModuleInit(); // Set isReady = true
        });

        it("should query with two parameters if no filter is provided", async () => {
            const embedding = [0.1, 0.2, 0.3];
            const topK = 5;

            await service.search(embedding, topK);

            expect(dataSourceMock.query).toHaveBeenLastCalledWith(expect.stringContaining("ORDER BY embedding <=> $1::vector LIMIT $2"), ["[0.1,0.2,0.3]", 5]);
        });

        it("should query with three parameters if a filter is provided", async () => {
            const embedding = [0.1, 0.2, 0.3];
            const topK = 5;
            const filter = { type: "faq" };

            await service.search(embedding, topK, filter);

            expect(dataSourceMock.query).toHaveBeenLastCalledWith(
                expect.stringContaining("WHERE metadata @> $2::jsonb ORDER BY embedding <=> $1::vector LIMIT $3"),
                ["[0.1,0.2,0.3]", JSON.stringify(filter), 5]
            );
        });
    });

    describe("deleteByFilter", () => {
        it("should execute delete query builder", async () => {
            const deleteMock = {
                where: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue({ affected: 3 })
            };
            const createQueryBuilderMock = {
                delete: jest.fn().mockReturnThis(),
                ...deleteMock
            };
            const getRepositoryMock = jest.fn().mockReturnValue({
                createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock)
            });

            dataSourceMock.getRepository = getRepositoryMock;
            await service.onModuleInit(); // Set isReady = true

            const result = await service.deleteByFilter({ session: "123" });

            expect(result).toBe(3);
            expect(getRepositoryMock).toHaveBeenCalled();
            expect(deleteMock.where).toHaveBeenCalledWith("metadata @> :filter", { filter: JSON.stringify({ session: "123" }) });
        });
    });
});
