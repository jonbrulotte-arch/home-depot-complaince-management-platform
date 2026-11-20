-- Review decision for lines that are not real violations (e.g. cancelled by the customer)
ALTER TYPE "Disposition" ADD VALUE 'RESOLVED';
