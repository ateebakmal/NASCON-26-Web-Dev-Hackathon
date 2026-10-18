-- CreateTable
CREATE TABLE "SavedList" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedList_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedList_workspaceId_recordType_idx" ON "SavedList"("workspaceId", "recordType");

-- CreateIndex
CREATE UNIQUE INDEX "SavedList_workspaceId_name_key" ON "SavedList"("workspaceId", "name");

-- AddForeignKey
ALTER TABLE "SavedList" ADD CONSTRAINT "SavedList_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

