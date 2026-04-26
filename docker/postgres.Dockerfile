FROM postgres:16.9

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        git \
        ca-certificates \
        postgresql-server-dev-16 && \
    update-ca-certificates && \
    git clone --branch v0.6.2 https://github.com/pgvector/pgvector.git /tmp/pgvector && \
    cd /tmp/pgvector && \
    make OPTFLAGS="" && \
    make OPTFLAGS="" install && \
    rm -rf /tmp/pgvector && \
    apt-get purge -y build-essential git && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
