-- Warehouse team influence split by site. Earlier "Warehouse" reviews keep that value
-- (shown as "Warehouse (site not set)") until someone picks a site.
ALTER TYPE "TeamInfluence" ADD VALUE 'WAREHOUSE_SITE_0' BEFORE 'WAREHOUSE';
ALTER TYPE "TeamInfluence" ADD VALUE 'WAREHOUSE_SITE_3' BEFORE 'WAREHOUSE';
