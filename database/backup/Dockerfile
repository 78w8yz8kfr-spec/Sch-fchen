FROM restic/restic:0.18.1 AS restic

FROM postgres:17-alpine

RUN apk add --no-cache ca-certificates tzdata
COPY --from=restic /usr/bin/restic /usr/local/bin/restic
COPY run-encrypted-backup.sh run-restore-drill.sh /usr/local/bin/
RUN chmod 0555 /usr/local/bin/run-encrypted-backup.sh /usr/local/bin/run-restore-drill.sh

USER postgres
ENTRYPOINT []
CMD ["run-encrypted-backup.sh"]
