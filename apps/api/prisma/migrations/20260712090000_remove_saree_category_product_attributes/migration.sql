-- Saree categories are represented by the existing Category hierarchy.
DELETE FROM "ProductAttribute"
WHERE "kind" = 'SAREE_CATEGORY';
