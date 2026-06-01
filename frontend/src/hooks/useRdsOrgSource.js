import { useState, useCallback } from 'react';

/** True when API indicates organization data comes from AWS RDS (read-only). */
export function isRdsOrgResponse(res) {
  return res?.data?.source === 'rds' || res?.data?.read_only === true;
}

/**
 * Track whether campuses/courses/batches/students are loaded from the master RDS database.
 */
export function useRdsOrgSource() {
  const [isRdsSource, setIsRdsSource] = useState(false);

  const applyFromResponse = useCallback((res) => {
    if (isRdsOrgResponse(res)) {
      setIsRdsSource(true);
    }
  }, []);

  return { isRdsSource, isRdsReadOnly: isRdsSource, applyFromResponse };
}

export default useRdsOrgSource;
