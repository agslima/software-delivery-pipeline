export async function getPrescription(id) {
  const response = await fetch(`/api/v1/prescriptions/${id}`);

  if (!response.ok) {
    throw new Error('Failed to fetch prescription');
  }

  return response.json();
}
