-- CreateTable
CREATE TABLE "NasaStudy" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mission" TEXT NOT NULL,
    "organism" TEXT NOT NULL,
    "files" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NasaStudy_pkey" PRIMARY KEY ("id")
);
