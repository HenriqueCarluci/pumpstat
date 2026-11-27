-- pg_net não pode ser movido com ALTER; reinstala no schema extensions. As funções continuam em net.* (só a fila de requisições em andamento é descartada).
drop extension if exists pg_net;
create extension pg_net with schema extensions;
