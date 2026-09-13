\pset tuples_only on
\pset format unaligned
COPY (SELECT jsonb_build_object('id', id, 'nodes', nodes, 'edges', edges, 'config', config) FROM "Flow") TO STDOUT;
